package handlers

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// @Summary 获取车手最新图表 PNG
// @Description 从静态目录中选择最新的图表 PNG（优先 fastest_lap_*）。
// @Tags Charts
// @Produce png
// @Param driver_number path int true "车手号码"
// @Success 200 {file} file
// @Failure 404
// @Router /api/v1/charts/driver/{driver_number}/latest.png [get]
func ChartsDriverLatestPng(staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		dn, _ := strconv.Atoi(c.Param("driver_number"))
		p, ok := pickLatestChart(staticDir, dn)
		if !ok {
			c.Status(404)
			return
		}
		c.File(p)
	}
}

// @Summary 获取车手最新图表 JSON
// @Description |
//   - 若图表不存在返回 {ok:true, found:false}
//   - 若存在则返回静态 JSON 文件的内容（结构透传）
// @Tags Charts
// @Produce json
// @Param driver_number path int true "车手号码"
// @Success 200 {object} GenericObject
// @Router /api/v1/charts/driver/{driver_number}/latest.json [get]
func ChartsDriverLatestJSON(staticDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		dn, _ := strconv.Atoi(c.Param("driver_number"))
		p, ok := pickLatestChart(staticDir, dn)
		if !ok {
			c.JSON(200, gin.H{"ok": true, "found": false})
			return
		}
		sidecar := strings.TrimSuffix(p, filepath.Ext(p)) + ".json"
		b, err := os.ReadFile(sidecar)
		if err != nil {
			c.JSON(200, gin.H{"ok": true, "found": false})
			return
		}
		var v any
		if err := json.Unmarshal(b, &v); err != nil {
			c.JSON(200, gin.H{"ok": true, "found": false})
			return
		}
		c.JSON(200, v)
	}
}

type chartCandidate struct {
	path string
	mt   int64
}

func pickLatestChart(staticDir string, driverNumber int) (string, bool) {
	base := pickDriverChartsDir(staticDir, driverNumber)
	if base == "" {
		base = pickDriverChartsDir(staticDir, 12)
	}
	if base == "" {
		return "", false
	}

	p := pickLatestPng(base)
	if p != "" {
		return p, true
	}
	if filepath.Base(base) != "driver_12" {
		base2 := pickDriverChartsDir(staticDir, 12)
		if base2 != "" {
			p2 := pickLatestPng(base2)
			if p2 != "" {
				return p2, true
			}
		}
	}
	return "", false
}

func pickDriverChartsDir(staticDir string, driverNumber int) string {
	p := filepath.Join(staticDir, "charts", "driver_"+strconv.Itoa(driverNumber))
	st, err := os.Stat(p)
	if err != nil || !st.IsDir() {
		return ""
	}
	return p
}

func pickLatestPng(base string) string {
	preferred := listPngs(base, func(name string) bool {
		return strings.HasPrefix(name, "fastest_lap_") && strings.HasSuffix(name, ".png")
	})
	if len(preferred) == 0 {
		preferred = listPngs(base, func(name string) bool {
			return strings.HasSuffix(name, ".png")
		})
	}
	if len(preferred) == 0 {
		return ""
	}
	sort.Slice(preferred, func(i, j int) bool {
		return preferred[i].mt > preferred[j].mt
	})
	return preferred[0].path
}

func listPngs(base string, match func(name string) bool) []chartCandidate {
	out := make([]chartCandidate, 0, 16)
	_ = filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d == nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		name := d.Name()
		if !match(name) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		out = append(out, chartCandidate{path: path, mt: info.ModTime().UnixNano()})
		return nil
	})
	return out
}

func serveBytes(c *gin.Context, contentType string, b []byte) {
	c.Data(200, contentType, b)
}

func serveStatus(c *gin.Context, code int) {
	c.Status(code)
}

func serveNotFound(c *gin.Context) {
	serveStatus(c, http.StatusNotFound)
}
