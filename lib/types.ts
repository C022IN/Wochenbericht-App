export type WeekCarData = {
  kennzeichen2: string;  // second car plate (optional)
  kmStand: string;       // odometer reading → U51
  kmGefahren: string;    // km driven during week → V51
};

export type UserProfile = {
  name: string;
  vorname: string;
  defaultArbeitsstaetteProjekte: string;
  defaultArtDerArbeit: string;
  kennzeichen: string;                        // primary car plate → U50
  weekData: Record<string, WeekCarData>;      // keyed "YYYY-WW", e.g. "2026-09"
};

export type DailyLineType = "arbeitszeit" | "baustelle";

export type DailyLine = {
  id: string;
  lineType: DailyLineType;
  siteNameOrt: string;
  beginn: string;
  ende: string;
  pauseOverride: string;
  dayHoursOverride: string;
  lohnType: string;
  ausloese: string;
  zulage: string;
  projektnummer: string;
  kabelschachtInfo: string;
  smNr: string;
  bauleiter: string;
  arbeitskollege: string;
};

export type DailyEntry = {
  date: string; // YYYY-MM-DD
  arbeitsstaetteProjekte: string;
  artDerArbeit: string;
  lines: DailyLine[];
  updatedAt: string;
};

export type AppDb = {
  profile: UserProfile;
  entries: Record<string, DailyEntry>;
};

export type WeekDayInfo = {
  date: string;
  isoWeekday: number; // 1=Mon..7=Sun
  day: number;
  month: number; // 1..12
  year: number;
};

export type WeekSegment = {
  key: string;
  month: number;
  year: number;
  dates: string[];
  startDate: string;
  endDate: string;
  isSingleDay: boolean;
};

export type WeekSummary = {
  year: number;
  kw: number;
  dates: string[];
  isMonthSplit: boolean;
  segments: WeekSegment[];
  filledDays: number;
  totalDaysWithEntries: number;
};

export const EMPTY_PROFILE: UserProfile = {
  name: "",
  vorname: "",
  defaultArbeitsstaetteProjekte: "",
  defaultArtDerArbeit: "",
  kennzeichen: "",
  weekData: {}
};

export const EMPTY_DAILY_LINE = (): DailyLine => ({
  id: "",
  lineType: "arbeitszeit",
  siteNameOrt: "",
  beginn: "",
  ende: "",
  pauseOverride: "",
  dayHoursOverride: "",
  lohnType: "S",
  ausloese: "",
  zulage: "",
  projektnummer: "",
  kabelschachtInfo: "",
  smNr: "",
  bauleiter: "",
  arbeitskollege: ""
});

export const EMPTY_DB: AppDb = {
  profile: EMPTY_PROFILE,
  entries: {}
};
