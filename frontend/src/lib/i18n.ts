import { useState, useEffect } from "react";

export type Language = "en" | "ta";

export interface TranslationDict {
  appName: string;
  appSubtitle: string;
  tagline: string;
  thirukkuralTamil: string;
  thirukkuralEnglish: string;
  publicDashboard: string;
  transparencyPortal: string;
  login: string;
  signOut: string;
  submitComplaint: string;
  myTickets: string;
  trackIssue: string;
  officerDashboard: string;
  deptHeadDashboard: string;
  officialDashboard: string;
  kpiTotalFiled: string;
  kpiResolved: string;
  kpiInProgress: string;
  kpiSlaAdherence: string;
  kpiAvgHours: string;
  departmentBreakdown: string;
  verifiedShowcase: string;
  verifiedShowcaseSub: string;
  thirtyDayTrend: string;
  thirtyDayTrendSub: string;
  statusNew: string;
  statusAssigned: string;
  statusInProgress: string;
  statusEscalated: string;
  statusResolved: string;
  duplicateNotice: string;
  voiceInput: string;
  listening: string;
  stopListening: string;
  uploadPhoto: string;
  beforePhoto: string;
  afterPhoto: string;
  verificationBadge: string;
  resolutionNotes: string;
  fastForwardDemo: string;
  escalationAudit: string;
  switchLang: string;
}

export const translations: Record<Language, TranslationDict> = {
  en: {
    appName: "AllalKalai",
    appSubtitle: "Autonomous Civic Accountability Platform",
    tagline: "Weed Out the Suffering — Thirukkural 555",
    thirukkuralTamil: "அல்லற்பட்டு ஆற்றாது அழுதகண் ணீரன்றே\nசெல்வத்தைத் தேய்க்கும் படை",
    thirukkuralEnglish: "His people's tears of sorrow past endurance, are not they\nSharp instruments to wear the monarch's wealth away",
    publicDashboard: "Public Transparency",
    transparencyPortal: "Open Civic Dashboard",
    login: "Official / Citizen Portal",
    signOut: "Sign Out",
    submitComplaint: "Report Grievance",
    myTickets: "My Complaints",
    trackIssue: "Track Status",
    officerDashboard: "Field Officer Tasks",
    deptHeadDashboard: "Department Head",
    officialDashboard: "Apex Oversight",
    kpiTotalFiled: "Total Complaints",
    kpiResolved: "Resolved & Verified",
    kpiInProgress: "In Active Progress",
    kpiSlaAdherence: "SLA Adherence Rate",
    kpiAvgHours: "Avg Resolution Time",
    departmentBreakdown: "Department Performance & SLA Adherence",
    verifiedShowcase: "AI-Verified Civic Resolutions",
    verifiedShowcaseSub: "Physical restoration verified by multimodal vision inspection before public release",
    thirtyDayTrend: "30-Day City-Wide Intake & Resolution Trends",
    thirtyDayTrendSub: "Real-time grievance filing versus completed civic remedies",
    statusNew: "Received",
    statusAssigned: "Assigned",
    statusInProgress: "In Progress",
    statusEscalated: "Escalated",
    statusResolved: "Resolved & Verified",
    duplicateNotice: "Other citizens have reported this exact issue in your locality. Grouped for priority response.",
    voiceInput: "Tap to Speak (Tamil / English / Hindi)",
    listening: "Listening... speak now",
    stopListening: "Done Speaking",
    uploadPhoto: "Upload Resolution Evidence",
    beforePhoto: "Citizen Complaint Photo",
    afterPhoto: "Completed Restoration Photo",
    verificationBadge: "AI Vision Verified",
    resolutionNotes: "Resolution Details",
    fastForwardDemo: "⚡ Fast-Forward Demo (Shift SLA -3h)",
    escalationAudit: "Escalation Audit Trail",
    switchLang: "தமிழ்",
  },
  ta: {
    appName: "அல்லல் களை",
    appSubtitle: "தானியங்கி மக்கள் குறைதீர்ப்பு மற்றும் பொறுப்புடைமை தளம்",
    tagline: "அல்லல் களைந்து நலம் காக்கும் அரசு — திருக்குறள் 555",
    thirukkuralTamil: "அல்லற்பட்டு ஆற்றாது அழுதகண் ணீரன்றே\nசெல்வத்தைத் தேய்க்கும் படை",
    thirukkuralEnglish: "துன்பம் பொறுக்க முடியாமல் குடிமக்கள் சிந்திய கண்ணீரே, ஆட்சியாளரின் செல்வத்தைத் தேய்த்து அழிக்கும் கூரிய படையாகும்.",
    publicDashboard: "பொது வெளிப்படைத்தன்மை",
    transparencyPortal: "பொதுமக்கள் தகவல் பலகை",
    login: "அலுவலர் / பொதுமக்கள் உள்நுழைவு",
    signOut: "வெளியேறு",
    submitComplaint: "குறை பதிவு செய்க",
    myTickets: "எனது கோரிக்கைகள்",
    trackIssue: "நிலை அறிதல்",
    officerDashboard: "கள அலுவலர் பணிகள்",
    deptHeadDashboard: "துறைத் தலைவர் பலகை",
    officialDashboard: "முதன்மை மேற்பார்வை",
    kpiTotalFiled: "மொத்த புகார்கள்",
    kpiResolved: "தீர்க்கப்பட்டவை",
    kpiInProgress: "நடவடிக்கையில் உள்ளவை",
    kpiSlaAdherence: "காலக்கெடு கடைபிடிப்பு வீதம்",
    kpiAvgHours: "சராசரி தீர்வு நேரம்",
    departmentBreakdown: "துறை வாரியான செயல்பாடுகள் மற்றும் காலக்கெடு நிலை",
    verifiedShowcase: "செயற்கை நுண்ணறிவு சரிபார்த்த நற்செயல்கள்",
    verifiedShowcaseSub: "களப்பணி முடிந்ததை புகைப்பட ஆதாரத்துடன் சரிபார்த்த சான்றுகள்",
    thirtyDayTrend: "கடந்த 30 நாள் குறைதீர்ப்பு போக்கு",
    thirtyDayTrendSub: "பதிவு செய்யப்பட்ட மற்றும் தீர்வு காணப்பட்ட கோரிக்கைகள்",
    statusNew: "பெறப்பட்டது",
    statusAssigned: "ஒதுக்கப்பட்டது",
    statusInProgress: "செயலில் உள்ளது",
    statusEscalated: "மேலதிகாரிக்கு மாற்றப்பட்டது",
    statusResolved: "சரிபார்க்கப்பட்டு தீர்க்கப்பட்டது",
    duplicateNotice: "உங்கள் பகுதியில் இதே பிரச்சனை குறித்து பிற பொதுமக்களும் புகார் அளித்துள்ளனர். முன்னுரிமை அளிக்கப்படுகிறது.",
    voiceInput: "குரல் வழி பதிவு செய்க (தமிழ் / ஆங்கிலம்)",
    listening: "கேட்கிறது... பேசுங்கள்",
    stopListening: "பேசி முடித்தேன்",
    uploadPhoto: "தீர்வுப் புகைப்படத்தை பதிவேற்றுக",
    beforePhoto: "தொடக்கப் புகைப்படம்",
    afterPhoto: "பணி முடிந்த புகைப்படம்",
    verificationBadge: "AI மூலம் சரிபார்க்கப்பட்டது",
    resolutionNotes: "தீர்வு விவரங்கள்",
    fastForwardDemo: "⚡ விரைவு செயல்முறை முன்னோட்டம் (SLA -3h)",
    escalationAudit: "மேல்முறையீட்டு தணிக்கை பதிவு",
    switchLang: "English",
  },
};

let currentLang: Language = (localStorage.getItem("allalkalai_lang") as Language) || "en";
const listeners = new Set<(lang: Language) => void>();

export function setLanguage(lang: Language) {
  currentLang = lang;
  localStorage.setItem("allalkalai_lang", lang);
  listeners.forEach((fn) => fn(lang));
}

export function getLanguage(): Language {
  return currentLang;
}

export function useLanguage() {
  const [lang, setLangState] = useState<Language>(currentLang);

  useEffect(() => {
    const handler = (newLang: Language) => setLangState(newLang);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const toggleLanguage = () => {
    setLanguage(lang === "en" ? "ta" : "en");
  };

  return {
    lang,
    t: translations[lang],
    toggleLanguage,
    setLanguage,
  };
}
