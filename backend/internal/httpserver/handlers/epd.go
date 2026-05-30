package handlers

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	xdraw "golang.org/x/image/draw"

	"github.com/gin-gonic/gin"
)

type epdFrame struct {
	w       int
	h       int
	bin     []byte
	preview []byte
}

// @Summary 生成电子纸 bin 帧
// @Description 从 png_url 拉取图片，按给定宽高缩放并生成 1bpp 黑白 bin 数据。
// @Tags EPD
// @Produce octet-stream
// @Param png_url query string true "源 PNG 图片 URL（服务端会拉取该资源）"
// @Param w query int false "目标宽度像素（1-1200）" default(1)
// @Param h query int false "目标高度像素（1-1200）" default(1)
// @Param dither query string false "抖动开关：传 1/true 开启"
// @Success 200 {file} file
// @Failure 400 {object} ErrorResponse
// @Failure 502 {object} ErrorResponse
// @Router /api/v1/epd/frame.bin [get]
func EpdFrameBin() gin.HandlerFunc {
	return func(c *gin.Context) {
		frame, ok := buildEpdFrameFromQuery(c)
		if !ok {
			return
		}
		c.Data(200, "application/octet-stream", frame.bin)
	}
}

// @Summary 生成电子纸预览 PNG
// @Description 与 frame.bin 相同逻辑，但返回 PNG 预览图（便于调试显示效果）。
// @Tags EPD
// @Produce png
// @Param png_url query string true "源 PNG 图片 URL（服务端会拉取该资源）"
// @Param w query int false "目标宽度像素（1-1200）" default(1)
// @Param h query int false "目标高度像素（1-1200）" default(1)
// @Param dither query string false "抖动开关：传 1/true 开启"
// @Success 200 {file} file
// @Failure 400 {object} ErrorResponse
// @Failure 502 {object} ErrorResponse
// @Router /api/v1/epd/frame.png [get]
func EpdFramePng() gin.HandlerFunc {
	return func(c *gin.Context) {
		frame, ok := buildEpdFrameFromQuery(c)
		if !ok {
			return
		}
		c.Data(200, "image/png", frame.preview)
	}
}

func buildEpdFrameFromQuery(c *gin.Context) (epdFrame, bool) {
	pngURL := strings.TrimSpace(c.Query("png_url"))
	if pngURL == "" {
		c.JSON(400, gin.H{"ok": false, "error": "missing_png_url"})
		return epdFrame{}, false
	}
	w := parseIntClamp(c.Query("w"), 1, 1200, 1)
	h := parseIntClamp(c.Query("h"), 1, 1200, 1)
	dither := strings.TrimSpace(c.Query("dither"))
	useDither := dither == "1" || strings.EqualFold(dither, "true")

	frame, err := buildEpdFrame(pngURL, w, h, useDither)
	if err != nil {
		c.JSON(502, gin.H{"ok": false, "error": "fetch_or_decode_failed"})
		return epdFrame{}, false
	}
	return frame, true
}

func parseIntClamp(s string, minV, maxV, def int) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < minV {
		return minV
	}
	if n > maxV {
		return maxV
	}
	return n
}

func buildEpdFrame(pngURL string, w, h int, dither bool) (epdFrame, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", pngURL, nil)
	if err != nil {
		return epdFrame{}, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return epdFrame{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return epdFrame{}, io.ErrUnexpectedEOF
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return epdFrame{}, err
	}
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return epdFrame{}, err
	}

	canvas := containResize(img, w, h)
	bw := mono1bit(canvas, dither)
	packed := pack1bppBlack1(bw)
	prev, err := encodePNG(bw)
	if err != nil {
		return epdFrame{}, err
	}

	return epdFrame{
		w:       w,
		h:       h,
		bin:     packed,
		preview: prev,
	}, nil
}

func containResize(src image.Image, targetW, targetH int) image.Image {
	if targetW <= 0 || targetH <= 0 {
		return src
	}

	sb := src.Bounds()
	srcW := sb.Dx()
	srcH := sb.Dy()
	if srcW <= 0 || srcH <= 0 {
		dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
		draw.Draw(dst, dst.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
		return dst
	}

	scaleW := float64(targetW) / float64(srcW)
	scaleH := float64(targetH) / float64(srcH)
	scale := scaleW
	if scaleH < scale {
		scale = scaleH
	}
	newW := int(float64(srcW) * scale)
	newH := int(float64(srcH) * scale)
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	scaled := image.NewRGBA(image.Rect(0, 0, newW, newH))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), src, sb, draw.Over, nil)

	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.Draw(dst, dst.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	offX := (targetW - newW) / 2
	offY := (targetH - newH) / 2
	draw.Draw(dst, image.Rect(offX, offY, offX+newW, offY+newH), scaled, image.Point{}, draw.Over)
	return dst
}

func mono1bit(src image.Image, dither bool) image.Image {
	pal := color.Palette{color.White, color.Black}
	dst := image.NewPaletted(src.Bounds(), pal)
	if dither {
		draw.FloydSteinberg.Draw(dst, src.Bounds(), src, image.Point{})
		return dst
	}

	b := src.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bb, _ := src.At(x, y).RGBA()
			l := (uint32(r>>8)*30 + uint32(g>>8)*59 + uint32(bb>>8)*11) / 100
			if l < 128 {
				dst.SetColorIndex(x, y, 1)
			} else {
				dst.SetColorIndex(x, y, 0)
			}
		}
	}
	return dst
}

func pack1bppBlack1(img image.Image) []byte {
	b := img.Bounds()
	w := b.Dx()
	h := b.Dy()
	rowBytes := (w + 7) >> 3
	out := make([]byte, rowBytes*h)

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, bb, _ := img.At(b.Min.X+x, b.Min.Y+y).RGBA()
			l := (uint32(r>>8)*30 + uint32(g>>8)*59 + uint32(bb>>8)*11) / 100
			if l < 128 {
				out[y*rowBytes+(x>>3)] |= 1 << uint(7-(x&7))
			}
		}
	}
	return out
}

func encodePNG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.NoCompression}
	if err := enc.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
