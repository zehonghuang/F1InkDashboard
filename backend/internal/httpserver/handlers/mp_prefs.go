package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"toinc_f1_backend/internal/teamdrivercache"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type mpPrefsUpdateRequest struct {
	TeamName      string   `json:"team_name"`
	TeamKeys      []string `json:"team_keys"`
	DriverNumbers []int    `json:"driver_numbers"`
}

func MpPrefsGet(db *gorm.DB, tdCache *teamdrivercache.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		v := strings.TrimSpace(c.Query("v"))

		userIDAny, ok := c.Get("mp_user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		userID, ok := userIDAny.(int64)
		if !ok || userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		if db == nil {
			LogReqError(c, "mp_prefs_get", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		type row struct {
			TeamName      string `gorm:"column:preferred_team_name"`
			TeamKeys      string `gorm:"column:preferred_team_keys"`
			DriverNumbers string `gorm:"column:preferred_driver_numbers"`
		}
		var r row
		if err := db.Raw(`
			SELECT preferred_team_name, preferred_team_keys, preferred_driver_numbers
			FROM mp_users
			WHERE id = ?
			LIMIT 1
		`, userID).Scan(&r).Error; err != nil {
			LogReqError(c, "mp_prefs_get", "db_query_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_query_failed"})
			return
		}

		teamKeys := mpParseStringList(r.TeamKeys)
		if len(teamKeys) == 0 && strings.TrimSpace(r.TeamName) != "" {
			teamKeys = []string{strings.TrimSpace(r.TeamName)}
		}
		driverNumbers := mpParseDriverNumbers(r.DriverNumbers)

		teamColors := map[string]string{}
		teamInfos := make([]gin.H, 0, len(teamKeys))
		teamsV2 := gin.H{}
		if tdCache != nil {
			for _, k := range teamKeys {
				if ti, ok := tdCache.GetTeam(k); ok {
					color := strings.TrimSpace(ti.TeamColor)
					if color != "" {
						teamColors[k] = color
					}
					teamInfos = append(teamInfos, gin.H{
						"team_key":      ti.TeamName,
						"team_name":     emptyToNil(strings.TrimSpace(ti.TeamName)),
						"team_color":    emptyToNil(color),
						"team_logo_url": emptyToNil(strings.TrimSpace(ti.TeamLogoURL)),
					})
					teamsV2[k] = gin.H{
						"color":    emptyToNil(color),
						"logo_url": emptyToNil(strings.TrimSpace(ti.TeamLogoURL)),
					}
				}
			}
		}
		driverColors := map[string]string{}
		driverInfos := make([]gin.H, 0, len(driverNumbers))
		driversV2 := gin.H{}
		if tdCache != nil {
			for _, n := range driverNumbers {
				if di, ok := tdCache.GetDriver(n); ok {
					color := strings.TrimSpace(di.TeamColor)
					if color != "" {
						driverColors[strconv.Itoa(n)] = color
					}
					driverInfos = append(driverInfos, gin.H{
						"driver_number":  di.DriverNumber,
						"full_name":      emptyToNil(strings.TrimSpace(di.FullName)),
						"broadcast_name": emptyToNil(strings.TrimSpace(di.BroadcastName)),
						"name_acronym":   emptyToNil(strings.TrimSpace(di.NameAcronym)),
						"headshot_url":   emptyToNil(strings.TrimSpace(di.HeadshotURL)),
						"team_name":      emptyToNil(strings.TrimSpace(di.TeamName)),
						"team_color":     emptyToNil(color),
					})

					name := strings.TrimSpace(di.FullName)
					if name == "" {
						name = strings.TrimSpace(di.BroadcastName)
					}
					if name == "" {
						name = strings.TrimSpace(di.NameAcronym)
					}
					driversV2[strconv.Itoa(di.DriverNumber)] = gin.H{
						"name":         emptyToNil(name),
						"acr":          emptyToNil(strings.TrimSpace(di.NameAcronym)),
						"headshot_url": emptyToNil(strings.TrimSpace(di.HeadshotURL)),
						"team_key":     emptyToNil(strings.TrimSpace(di.TeamName)),
						"color":        emptyToNil(color),
					}
				}
			}
		}

		if v != "1" {
			c.JSON(http.StatusOK, gin.H{
				"ok":               true,
				"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
				"prefs": gin.H{
					"team_keys":      teamKeys,
					"driver_numbers": driverNumbers,
					"teams":          teamsV2,
					"drivers":        driversV2,
				},
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":               true,
			"generated_at_utc": time.Now().UTC().Format(time.RFC3339Nano),
			"prefs": gin.H{
				"team_name":      emptyToNil(strings.TrimSpace(r.TeamName)),
				"team_keys":      teamKeys,
				"driver_numbers": driverNumbers,
				"team_colors":    teamColors,
				"driver_colors":  driverColors,
				"team_infos":     teamInfos,
				"driver_infos":   driverInfos,
			},
		})
	}
}

func MpPrefsUpdate(db *gorm.DB, tdCache *teamdrivercache.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		v := strings.TrimSpace(c.Query("v"))

		userIDAny, ok := c.Get("mp_user_id")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		userID, ok := userIDAny.(int64)
		if !ok || userID <= 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "unauthorized"})
			return
		}
		if db == nil {
			LogReqError(c, "mp_prefs_update", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "mysql_required"})
			return
		}

		var req mpPrefsUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "bad_json"})
			return
		}

		team := strings.TrimSpace(req.TeamName)
		if len(team) > 64 {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "team_name_too_long"})
			return
		}

		teamsUniq := map[string]struct{}{}
		outTeams := make([]string, 0, len(req.TeamKeys))
		for _, t := range req.TeamKeys {
			v := strings.TrimSpace(t)
			if v == "" {
				continue
			}
			if len(v) > 64 {
				continue
			}
			if _, ok := teamsUniq[v]; ok {
				continue
			}
			teamsUniq[v] = struct{}{}
			outTeams = append(outTeams, v)
		}
		sort.Strings(outTeams)
		if len(outTeams) > 12 {
			outTeams = outTeams[:12]
		}
		if len(outTeams) == 0 && team != "" {
			outTeams = []string{team}
		}

		uniq := map[int]struct{}{}
		outDrivers := make([]int, 0, len(req.DriverNumbers))
		for _, n := range req.DriverNumbers {
			if n <= 0 || n > 999 {
				continue
			}
			if _, ok := uniq[n]; ok {
				continue
			}
			uniq[n] = struct{}{}
			outDrivers = append(outDrivers, n)
		}
		sort.Ints(outDrivers)
		if len(outDrivers) > 12 {
			outDrivers = outDrivers[:12]
		}

		driversJSON := "[]"
		if b, err := json.Marshal(outDrivers); err == nil {
			driversJSON = string(b)
		}
		teamsJSON := "[]"
		if b, err := json.Marshal(outTeams); err == nil {
			teamsJSON = string(b)
		}
		teamName := ""
		if len(outTeams) > 0 {
			teamName = outTeams[0]
		}

		if err := db.Exec(`
			UPDATE mp_users
			SET
				preferred_team_name = ?,
				preferred_team_keys = ?,
				preferred_driver_numbers = ?,
				updated_at = UTC_TIMESTAMP(3)
			WHERE id = ?
		`, teamName, teamsJSON, driversJSON, userID).Error; err != nil {
			LogReqError(c, "mp_prefs_update", "db_exec_failed", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "db_exec_failed"})
			return
		}

		teamColors := map[string]string{}
		teamInfos := make([]gin.H, 0, len(outTeams))
		teamsV2 := gin.H{}
		if tdCache != nil {
			for _, k := range outTeams {
				if ti, ok := tdCache.GetTeam(k); ok {
					color := strings.TrimSpace(ti.TeamColor)
					if color != "" {
						teamColors[k] = color
					}
					teamInfos = append(teamInfos, gin.H{
						"team_key":      ti.TeamName,
						"team_name":     emptyToNil(strings.TrimSpace(ti.TeamName)),
						"team_color":    emptyToNil(color),
						"team_logo_url": emptyToNil(strings.TrimSpace(ti.TeamLogoURL)),
					})
					teamsV2[k] = gin.H{
						"color":    emptyToNil(color),
						"logo_url": emptyToNil(strings.TrimSpace(ti.TeamLogoURL)),
					}
				}
			}
		}
		driverColors := map[string]string{}
		driverInfos := make([]gin.H, 0, len(outDrivers))
		driversV2 := gin.H{}
		if tdCache != nil {
			for _, n := range outDrivers {
				if di, ok := tdCache.GetDriver(n); ok {
					color := strings.TrimSpace(di.TeamColor)
					if color != "" {
						driverColors[strconv.Itoa(n)] = color
					}
					driverInfos = append(driverInfos, gin.H{
						"driver_number":  di.DriverNumber,
						"full_name":      emptyToNil(strings.TrimSpace(di.FullName)),
						"broadcast_name": emptyToNil(strings.TrimSpace(di.BroadcastName)),
						"name_acronym":   emptyToNil(strings.TrimSpace(di.NameAcronym)),
						"headshot_url":   emptyToNil(strings.TrimSpace(di.HeadshotURL)),
						"team_name":      emptyToNil(strings.TrimSpace(di.TeamName)),
						"team_color":     emptyToNil(color),
					})

					name := strings.TrimSpace(di.FullName)
					if name == "" {
						name = strings.TrimSpace(di.BroadcastName)
					}
					if name == "" {
						name = strings.TrimSpace(di.NameAcronym)
					}
					driversV2[strconv.Itoa(di.DriverNumber)] = gin.H{
						"name":         emptyToNil(name),
						"acr":          emptyToNil(strings.TrimSpace(di.NameAcronym)),
						"headshot_url": emptyToNil(strings.TrimSpace(di.HeadshotURL)),
						"team_key":     emptyToNil(strings.TrimSpace(di.TeamName)),
						"color":        emptyToNil(color),
					}
				}
			}
		}

		if v != "1" {
			c.JSON(http.StatusOK, gin.H{
				"ok": true,
				"prefs": gin.H{
					"team_keys":      outTeams,
					"driver_numbers": outDrivers,
					"teams":          teamsV2,
					"drivers":        driversV2,
				},
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ok": true,
			"prefs": gin.H{
				"team_name":      emptyToNil(teamName),
				"team_keys":      outTeams,
				"driver_numbers": outDrivers,
				"team_colors":    teamColors,
				"driver_colors":  driverColors,
				"team_infos":     teamInfos,
				"driver_infos":   driverInfos,
			},
		})
	}
}

func mpParseDriverNumbers(raw string) []int {
	s := strings.TrimSpace(raw)
	if s == "" {
		return []int{}
	}
	if strings.HasPrefix(s, "[") {
		var arr []int
		if err := json.Unmarshal([]byte(s), &arr); err == nil {
			out := make([]int, 0, len(arr))
			seen := map[int]struct{}{}
			for _, n := range arr {
				if n <= 0 || n > 999 {
					continue
				}
				if _, ok := seen[n]; ok {
					continue
				}
				seen[n] = struct{}{}
				out = append(out, n)
			}
			sort.Ints(out)
			return out
		}
	}

	parts := strings.Split(s, ",")
	out := make([]int, 0, len(parts))
	seen := map[int]struct{}{}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.Atoi(p)
		if err != nil || n <= 0 || n > 999 {
			continue
		}
		if _, ok := seen[n]; ok {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	sort.Ints(out)
	return out
}

func mpParseStringList(raw string) []string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return []string{}
	}
	if strings.HasPrefix(s, "[") {
		var arr []string
		if err := json.Unmarshal([]byte(s), &arr); err == nil {
			out := make([]string, 0, len(arr))
			seen := map[string]struct{}{}
			for _, v := range arr {
				t := strings.TrimSpace(v)
				if t == "" {
					continue
				}
				if _, ok := seen[t]; ok {
					continue
				}
				seen[t] = struct{}{}
				out = append(out, t)
			}
			sort.Strings(out)
			return out
		}
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t == "" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}
