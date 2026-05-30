package teamdrivercache

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"toinc_f1_backend/internal/thirdparty"

	"gorm.io/gorm"
)

type TeamInfo struct {
	TeamName   string `json:"team_name"`
	TeamColor  string `json:"team_color"`
	TeamLogoURL string `json:"team_logo_url"`
}

type DriverInfo struct {
	DriverNumber  int    `json:"driver_number"`
	FullName      string `json:"full_name"`
	BroadcastName string `json:"broadcast_name"`
	NameAcronym   string `json:"name_acronym"`
	HeadshotURL   string `json:"headshot_url"`
	TeamName      string `json:"team_name"`
	TeamColor     string `json:"team_color"`
}

type Snapshot struct {
	GeneratedAtUTC string                `json:"generated_at_utc"`
	Teams          map[string]TeamInfo   `json:"teams"`
	Drivers        map[string]DriverInfo `json:"drivers"`
}

type Manager struct {
	db        *gorm.DB
	staticDir string
	cachePath string

	mu      sync.RWMutex
	ready   bool
	running bool
	data    Snapshot
}

func New(db *gorm.DB, staticDir string) *Manager {
	cachePath := ""
	if strings.TrimSpace(staticDir) != "" {
		cachePath = filepath.Join(staticDir, "cache", "team_driver.json")
	}
	return &Manager{
		db:        db,
		staticDir: staticDir,
		cachePath: cachePath,
		data: Snapshot{
			Teams:   map[string]TeamInfo{},
			Drivers: map[string]DriverInfo{},
		},
	}
}

func (m *Manager) Start() {
	go func() {
		_ = m.LoadFromDisk()
		_ = m.Refresh()
		m.loop()
	}()
}

func (m *Manager) IsReady() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.ready
}

func (m *Manager) GetDriver(driverNumber int) (DriverInfo, bool) {
	if driverNumber <= 0 {
		return DriverInfo{}, false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.data.Drivers[fmt.Sprintf("%d", driverNumber)]
	return v, ok
}

func (m *Manager) GetTeam(teamName string) (TeamInfo, bool) {
	k := strings.TrimSpace(teamName)
	if k == "" {
		return TeamInfo{}, false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.data.Teams[k]
	return v, ok
}

func (m *Manager) LoadFromDisk() error {
	if strings.TrimSpace(m.cachePath) == "" {
		return fmt.Errorf("cache_path_empty")
	}
	b, err := os.ReadFile(m.cachePath)
	if err != nil {
		return err
	}
	var snap Snapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return err
	}
	if snap.Teams == nil {
		snap.Teams = map[string]TeamInfo{}
	}
	if snap.Drivers == nil {
		snap.Drivers = map[string]DriverInfo{}
	}
	m.mu.Lock()
	m.data = snap
	m.ready = true
	m.mu.Unlock()
	return nil
}

func (m *Manager) Refresh() error {
	if m.db == nil {
		return fmt.Errorf("mysql_required")
	}

	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return fmt.Errorf("refresh_running")
	}
	m.running = true
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		m.running = false
		m.mu.Unlock()
	}()

	type drvRow struct {
		DriverNumber  int     `gorm:"column:driver_number"`
		FullName      *string `gorm:"column:full_name"`
		BroadcastName *string `gorm:"column:broadcast_name"`
		HeadshotURL   *string `gorm:"column:headshot_url"`
		TeamName      *string `gorm:"column:team_name"`
		TeamColour    *string `gorm:"column:team_colour"`
		NameAcronym   *string `gorm:"column:name_acronym"`
	}
	var drivers []drvRow
	if err := m.db.Raw(`
		SELECT d.driver_number, d.full_name, d.broadcast_name, d.headshot_url, d.team_name, d.team_colour, d.name_acronym
		FROM openf1_drivers d
		JOIN (
			SELECT driver_number, MAX(session_key) AS session_key
			FROM openf1_drivers
			GROUP BY driver_number
		) x ON x.driver_number = d.driver_number AND x.session_key = d.session_key
	`).Scan(&drivers).Error; err != nil {
		return err
	}

	type teamRow struct {
		TeamName   *string `gorm:"column:team_name"`
		TeamColour *string `gorm:"column:team_colour"`
	}
	var teams []teamRow
	_ = m.db.Raw(`
		SELECT d.team_name, d.team_colour
		FROM openf1_drivers d
		JOIN (
			SELECT team_name, MAX(session_key) AS session_key
			FROM openf1_drivers
			WHERE team_name IS NOT NULL AND team_name <> ''
			GROUP BY team_name
		) x ON x.team_name = d.team_name AND x.session_key = d.session_key
	`).Scan(&teams).Error

	nextTeams := map[string]TeamInfo{}
	for _, t := range teams {
		name := ""
		if t.TeamName != nil {
			name = strings.TrimSpace(*t.TeamName)
		}
		if name == "" {
			continue
		}
		color := ""
		if t.TeamColour != nil {
			color = normalizeTeamColor(*t.TeamColour)
		}
		nextTeams[name] = TeamInfo{
			TeamName:   name,
			TeamColor:  color,
			TeamLogoURL: "",
		}
	}

	if strings.TrimSpace(m.staticDir) != "" {
		keys := make([]string, 0, len(nextTeams))
		for k := range nextTeams {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			ti := nextTeams[k]
			ti.TeamLogoURL = strings.TrimSpace(thirdparty.EnsureFormula1TeamLogo(m.staticDir, k))
			nextTeams[k] = ti
		}
	}

	nextDrivers := map[string]DriverInfo{}
	for _, d := range drivers {
		if d.DriverNumber <= 0 {
			continue
		}
		full := ""
		if d.FullName != nil {
			full = strings.TrimSpace(*d.FullName)
		}
		bn := ""
		if d.BroadcastName != nil {
			bn = strings.TrimSpace(*d.BroadcastName)
		}
		hs := ""
		if d.HeadshotURL != nil {
			hs = strings.TrimSpace(*d.HeadshotURL)
		}
		team := ""
		if d.TeamName != nil {
			team = strings.TrimSpace(*d.TeamName)
		}
		color := ""
		if d.TeamColour != nil {
			color = normalizeTeamColor(*d.TeamColour)
		}
		acr := ""
		if d.NameAcronym != nil {
			acr = strings.TrimSpace(*d.NameAcronym)
		}
		if color == "" && team != "" {
			if ti, ok := nextTeams[team]; ok {
				color = ti.TeamColor
			}
		}
		nextDrivers[fmt.Sprintf("%d", d.DriverNumber)] = DriverInfo{
			DriverNumber:  d.DriverNumber,
			FullName:      full,
			BroadcastName: bn,
			NameAcronym:   acr,
			HeadshotURL:   hs,
			TeamName:      team,
			TeamColor:     color,
		}
	}

	snap := Snapshot{
		GeneratedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
		Teams:          nextTeams,
		Drivers:        nextDrivers,
	}

	if strings.TrimSpace(m.cachePath) != "" {
		if err := os.MkdirAll(filepath.Dir(m.cachePath), 0o755); err == nil {
			if b, err := json.Marshal(snap); err == nil {
				_ = os.WriteFile(m.cachePath, b, 0o644)
			}
		}
	}

	m.mu.Lock()
	m.data = snap
	m.ready = true
	m.mu.Unlock()
	return nil
}

func (m *Manager) loop() {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.Local
	}
	for {
		now := time.Now().In(loc)
		next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, loc)
		d := time.Until(next)
		if d < 0 {
			d = time.Minute
		}
		t := time.NewTimer(d)
		<-t.C
		if err := m.Refresh(); err != nil {
			log.Printf("teamdrivercache refresh failed: %v", err)
		} else {
			log.Printf("teamdrivercache refreshed: %s", time.Now().UTC().Format(time.RFC3339Nano))
		}
	}
}

func normalizeTeamColor(s string) string {
	v := strings.TrimSpace(s)
	if v == "" {
		return ""
	}
	if strings.HasPrefix(v, "#") {
		v = strings.TrimPrefix(v, "#")
	}
	v = strings.TrimSpace(v)
	if len(v) == 3 {
		v = fmt.Sprintf("%c%c%c%c%c%c", v[0], v[0], v[1], v[1], v[2], v[2])
	}
	if len(v) != 6 {
		return ""
	}
	for i := 0; i < 6; i++ {
		c := v[i]
		isNum := c >= '0' && c <= '9'
		isAF := c >= 'a' && c <= 'f'
		isAFU := c >= 'A' && c <= 'F'
		if !isNum && !isAF && !isAFU {
			return ""
		}
	}
	return "#" + strings.ToUpper(v)
}
