package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"toinc_f1_backend/internal/f1db"
	"toinc_f1_backend/internal/model"
	"toinc_f1_backend/internal/teamdrivercache"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// @Summary 赛季积分榜（年度排名）
// @Description 返回指定赛季的车手/车队年度积分榜（基于 OpenF1 最新可用 session_key），并拼装车手头像与车队颜色/Logo。
// @Tags MiniProgram
// @Produce json
// @Param season query int false "赛季年份，例如 2026"
// @Success 200 {object} model.MpStandingsResponse
// @Failure 400 {object} model.ErrorResponse
// @Failure 503 {object} model.ErrorResponse
// @Router /api/v1/mp/standings [get]
func MpStandings(db *gorm.DB, tdCache *teamdrivercache.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			LogReqError(c, "mp_standings", "mysql_required", nil)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "mysql_required"})
			return
		}

		season := toIntQuery(c, "season", 0)
		if season <= 0 {
			season = time.Now().Year()
		}

		sessionKey, err := f1db.OpenF1LatestRaceSessionKey(db, season)
		if err != nil {
			if err == f1db.ErrNoOpenF1ChampionshipData {
				c.JSON(http.StatusOK, model.MpStandingsResponse{
					Ok:             true,
					GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
					Season:         season,
					SessionKey:     0,
					Drivers:        []model.MpStandingsDriverItem{},
					Constructors:   []model.MpStandingsConstructorItem{},
				})
				return
			}
			LogReqError(c, "mp_standings", "standings_unavailable", err)
			c.JSON(http.StatusServiceUnavailable, model.ErrorResponse{Ok: false, Error: "standings_unavailable"})
			return
		}

		type drvRow struct {
			DriverNumber    int     `gorm:"column:driver_number"`
			PositionCurrent int     `gorm:"column:position_current"`
			PointsCurrent   float64 `gorm:"column:points_current"`
			FirstName       string  `gorm:"column:first_name"`
			LastName        string  `gorm:"column:last_name"`
			NameAcronym     string  `gorm:"column:name_acronym"`
			TeamName        *string `gorm:"column:team_name"`
		}
		var drvRows []drvRow
		_ = db.Raw(`
			SELECT
			  cd.driver_number,
			  cd.position_current,
			  cd.points_current,
			  d.first_name,
			  d.last_name,
			  d.name_acronym,
			  d.team_name
			FROM openf1_championship_drivers cd
			LEFT JOIN openf1_drivers d
			  ON d.session_key = cd.session_key AND d.driver_number = cd.driver_number
			WHERE cd.session_key = ?
			ORDER BY cd.position_current ASC
		`, sessionKey).Scan(&drvRows).Error

		type consRow struct {
			TeamName        string  `gorm:"column:team_name"`
			PositionCurrent int     `gorm:"column:position_current"`
			PointsCurrent   float64 `gorm:"column:points_current"`
		}
		var consRows []consRow
		_ = db.Raw(`
			SELECT team_name, position_current, points_current
			FROM openf1_championship_teams
			WHERE session_key = ?
			ORDER BY position_current ASC
		`, sessionKey).Scan(&consRows).Error

		baseURL := inferBaseURL(c)
		absURL := func(v string) string {
			s := strings.TrimSpace(v)
			if s == "" {
				return ""
			}
			if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") {
				return s
			}
			if !strings.HasPrefix(s, "/") {
				s = "/" + s
			}
			if baseURL == "" {
				return s
			}
			return baseURL + s
		}

		drivers := make([]model.MpStandingsDriverItem, 0, len(drvRows))
		for _, r := range drvRows {
			team := ""
			if r.TeamName != nil {
				team = strings.TrimSpace(*r.TeamName)
			}
			avatar := ""
			teamColor := ""
			teamLogoURL := ""
			fullName := strings.TrimSpace(strings.TrimSpace(r.FirstName) + " " + strings.TrimSpace(r.LastName))
			acr := strings.TrimSpace(r.NameAcronym)
			displayName := fullName

			if tdCache != nil {
				if di, ok := tdCache.GetDriver(r.DriverNumber); ok {
					if team == "" {
						team = strings.TrimSpace(di.TeamName)
					}
					avatar = strings.TrimSpace(di.HeadshotURL)
					if fullName == "" {
						fullName = strings.TrimSpace(di.FullName)
					}
					if acr == "" {
						acr = strings.TrimSpace(di.NameAcronym)
					}
					if displayName == "" {
						displayName = strings.TrimSpace(di.FullName)
						if displayName == "" {
							displayName = strings.TrimSpace(di.BroadcastName)
						}
						if displayName == "" {
							displayName = acr
						}
					}
					teamColor = strings.TrimSpace(di.TeamColor)
				}
				if team != "" {
					if ti, ok := tdCache.GetTeam(team); ok {
						if teamColor == "" {
							teamColor = strings.TrimSpace(ti.TeamColor)
						}
						teamLogoURL = strings.TrimSpace(ti.TeamLogoURL)
					}
				}
			}
			teamLogoURL = absURL(teamLogoURL)
			if displayName == "" {
				displayName = acr
			}
			if displayName == "" {
				displayName = fmt.Sprintf("%d", r.DriverNumber)
			}

			drivers = append(drivers, model.MpStandingsDriverItem{
				Position:     r.PositionCurrent,
				Points:       r.PointsCurrent,
				DriverNumber: r.DriverNumber,
				DisplayName:  emptyToNil(displayName),
				FullName:     emptyToNil(fullName),
				NameAcronym:  emptyToNil(acr),
				TeamName:     emptyToNil(team),
				TeamColor:    emptyToNil(teamColor),
				HeadshotURL:  emptyToNil(avatar),
				TeamLogoURL:  emptyToNil(teamLogoURL),
			})
		}

		constructors := make([]model.MpStandingsConstructorItem, 0, len(consRows))
		for _, r := range consRows {
			team := strings.TrimSpace(r.TeamName)
			teamColor := ""
			teamLogoURL := ""
			if tdCache != nil && team != "" {
				if ti, ok := tdCache.GetTeam(team); ok {
					teamColor = strings.TrimSpace(ti.TeamColor)
					teamLogoURL = strings.TrimSpace(ti.TeamLogoURL)
				}
			}
			teamLogoURL = absURL(teamLogoURL)
			constructors = append(constructors, model.MpStandingsConstructorItem{
				Position:    r.PositionCurrent,
				Points:      r.PointsCurrent,
				TeamName:    emptyToNil(team),
				TeamColor:   emptyToNil(teamColor),
				TeamLogoURL: emptyToNil(teamLogoURL),
			})
		}

		c.JSON(http.StatusOK, model.MpStandingsResponse{
			Ok:             true,
			GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
			Season:         season,
			SessionKey:     sessionKey,
			Drivers:        drivers,
			Constructors:   constructors,
		})
	}
}
