package model

type MpNewsLayoutCode string

const (
	MpNewsLayoutCodeBreaking MpNewsLayoutCode = "BREAKING"
	MpNewsLayoutCodeHero     MpNewsLayoutCode = "HERO"
	MpNewsLayoutCodeFeature  MpNewsLayoutCode = "FEATURE"
	MpNewsLayoutCodeStandard MpNewsLayoutCode = "STANDARD"
	MpNewsLayoutCodeBulletin MpNewsLayoutCode = "BULLETIN"
)

type MpNewsHeroDisplayCode string

const (
	MpNewsHeroDisplayCodeBanner MpNewsHeroDisplayCode = "BANNER"
	MpNewsHeroDisplayCodeCard   MpNewsHeroDisplayCode = "CARD"
)

type MpNewsTypeCode string

const (
	MpNewsTypeCodeRegulation MpNewsTypeCode = "REGULATION"
	MpNewsTypeCodePaddock    MpNewsTypeCode = "PADDOCK"
	MpNewsTypeCodeStrategy   MpNewsTypeCode = "STRATEGY"
	MpNewsTypeCodeDriver     MpNewsTypeCode = "DRIVER"
	MpNewsTypeCodeTech       MpNewsTypeCode = "TECH"
)
