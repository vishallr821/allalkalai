import { ValidDepartment } from "../../config/env";

export interface RuleBasedIssue {
  department: ValidDepartment;
  issue_text: string;
  deadline: string | null;
  priority: "low" | "medium" | "high";
  sla_hours: number;
}

export interface RuleBasedTriageResult {
  detected_language: "Tamil" | "Hindi" | "English" | "Other";
  issues: RuleBasedIssue[];
}

interface DepartmentKeywords {
  department: ValidDepartment;
  tamil: string[];
  hindi: string[];
  english: string[];
  defaultEnglishTemplate: string;
}

const TAXONOMY: DepartmentKeywords[] = [
  {
    department: "Water",
    tamil: ["தண்ணீர்", "குடிநீர்", "குழாய்", "சாக்கடை", "பைப்", "வடிகால்", "நீர்", "கசிவு", "வால்வு"],
    hindi: ["पानी", "जल", "पाइप", "नल", "सीवर", "लीकेज", "नाला", "मोटर", "टोंटी"],
    english: ["water", "pipe", "leak", "drainage", "sewage", "drinking", "supply", "pipeline", "tap", "burst", "meter"],
    defaultEnglishTemplate: "Water supply pipeline leak and distribution disruption reported.",
  },
  {
    department: "Electricity",
    tamil: ["மின்சாரம்", "கரண்ட்", "விளக்கு", "தெருவிளக்கு", "மின்வயர்", "மின்மாற்றி", "ஒளி", "ஷார்ட்", "வோல்டேஜ்", "கம்பம்", "மின்கம்பம்"],
    hindi: ["बिजली", "करंट", "बत्ती", "स्ट्रीट लाइट", "लाइट", "ट्रांसफार्मर", "तार", "स्पार्क", "वोल्टेज", "अंधेरा", "खंभा"],
    english: ["electricity", "electric", "power", "light", "streetlight", "transformer", "wire", "spark", "voltage", "blackout", "cable", "pole", "poles"],
    defaultEnglishTemplate: "Electrical power failure, broken streetlights or hazardous cable reported.",
  },
  {
    department: "Sanitation",
    tamil: ["குப்பை", "கழிவு", "துர்நாற்றம்", "சுத்தம்", "குப்பைத்தொட்டி", "தூய்மை", "அசுத்தம்", "அடைப்பு"],
    hindi: ["कचरा", "गंदगी", "सफाई", "कूड़ा", "बदबू", "डस्टबिन", "कचरापेटी", "नाली जाम"],
    english: ["sanitation", "garbage", "trash", "waste", "dirty", "clean", "dump", "smell", "stink", "bin", "filth", "dumping"],
    defaultEnglishTemplate: "Uncollected garbage and unhygienic waste dumping reported.",
  },
  {
    department: "Roads",
    tamil: ["சாலை", "பள்ளம்", "குண்டு", "ரோடு", "தார்ச்சாலை", "போக்குவரத்து", "நடைபாதை", "வேகத்தடை"],
    hindi: ["सड़क", "गड्ढा", "रोड", "फुटपाथ", "डामर", "ट्रैफिक", "स्पीड ब्रेकर"],
    english: ["road", "pothole", "potholes", "plot hole", "plot holes", "pavement", "street", "crater", "asphalt", "footpath", "sidewalk", "highway", "culvert"],
    defaultEnglishTemplate: "Road damage, hazardous potholes or broken pavement reported.",
  },
  {
    department: "Health",
    tamil: ["மருத்துவம்", "கொசு", "டெங்கு", "மருத்துவமனை", "மருந்து", "சுகாதார", "காய்ச்சல்", "டாக்டர்"],
    hindi: ["अस्पताल", "दवा", "स्वास्थ्य", "डेंगू", "मच्छर", "डॉक्टर", "बुखार", "क्लिनिक", "बीमारी"],
    english: ["health", "hospital", "mosquito", "dengue", "clinic", "medicine", "fever", "medical", "doctor", "dispensary", "fogging"],
    defaultEnglishTemplate: "Public health hazard, disease vector breeding or clinic medicine shortage reported.",
  },
  {
    department: "Revenue",
    tamil: ["பட்டா", "நிலம்", "வருவாய்", "ஓய்வூதியம்", "ரேஷன்", "சான்றிதழ்", "சொத்து", "சர்வே", "வட்டாட்சியர்"],
    hindi: ["जमीन", "पट्टा", "राशन", "पेंशन", "राजस्व", "प्रमाण पत्र", "संपत्ति", "तहसील"],
    english: ["patta", "land", "ration", "pension", "tax", "revenue", "survey", "certificate", "deed", "property", "encroachment on land"],
    defaultEnglishTemplate: "Revenue department service delay regarding patta, land survey or certificates.",
  },
  {
    department: "Police",
    tamil: ["காவல்", "போலீஸ்", "சண்டை", "திருட்டு", "ஆக்கிரமிப்பு", "பாதுகாப்பு", "நெரிசல்", "வாகன நிறுத்தம்", "சட்டவிரோத"],
    hindi: ["पुलिस", "चोरी", "जाम", "सुरक्षा", "अपराध", "झगड़ा", "अतिक्रमण", "अवैध पार्किंग"],
    english: ["police", "crime", "theft", "encroachment", "parking", "illegal", "dispute", "fight", "patrol", "security", "traffic congestion"],
    defaultEnglishTemplate: "Public safety concern, illegal obstruction or law enforcement assistance required.",
  },
];

/**
 * Detect language based on Unicode character frequency
 */
export function detectLanguage(text: string): "Tamil" | "Hindi" | "English" | "Other" {
  let tamilCount = 0;
  let hindiCount = 0;
  let englishCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Tamil Unicode Block: 0B80 - 0BFF
    if (code >= 0x0b80 && code <= 0x0bff) {
      tamilCount++;
    }
    // Devanagari (Hindi) Unicode Block: 0900 - 097F
    else if (code >= 0x0900 && code <= 0x097f) {
      hindiCount++;
    }
    // Basic Latin / English
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      englishCount++;
    }
  }

  if (tamilCount > 2 && tamilCount >= hindiCount) return "Tamil";
  if (hindiCount > 2 && hindiCount > tamilCount) return "Hindi";
  if (englishCount > 5) return "English";
  return "Other";
}

/**
 * Extracts priority based on urgency keywords in Tamil, Hindi, and English
 */
function extractPriority(text: string): { priority: "low" | "medium" | "high"; slaHours: number } {
  const lower = text.toLowerCase();
  
  // High Priority triggers
  const highTriggers = [
    "urgent", "danger", "hazard", "spark", "fire", "burst", "overflow", "accident", "emergency", "dead",
    "அபாயம்", "உடனடி", "தீ", "உடைப்பு", "விபத்து", "அவசரம்",
    "खतरा", "तुरंत", "आग", "दुर्घटना", "इमरजेंसी", "लीक"
  ];
  for (const trigger of highTriggers) {
    if (lower.includes(trigger)) {
      return { priority: "high", slaHours: 24 };
    }
  }

  // Low Priority triggers
  const lowTriggers = [
    "information", "tree", "paint", "notice", "inquiry",
    "விவரம்", "மரம்", "வண்ணம்", "தகவல்",
    "जानकारी", "पेड़", "सूचना"
  ];
  for (const trigger of lowTriggers) {
    if (lower.includes(trigger)) {
      return { priority: "low", slaHours: 72 };
    }
  }

  return { priority: "medium", slaHours: 48 };
}

/**
 * Extracts date if explicitly mentioned (YYYY-MM-DD or DD/MM/YYYY)
 */
function extractDeadline(text: string, officialDeadline?: string | null): string | null {
  if (officialDeadline) return officialDeadline;
  
  // Check for ISO date format YYYY-MM-DD
  const isoMatch = text.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
  if (isoMatch) return isoMatch[1];

  // Check for DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = text.match(/\b([0-3]?\d)[\/\-]([01]?\d)[\/\-](202\d)\b/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Deterministic rule-based classifier that handles Tamil, Hindi, and English input.
 */
export function classifyWithRules(
  complaintText: string,
  officialDeadline?: string | null
): RuleBasedTriageResult {
  const language = detectLanguage(complaintText);
  const lower = complaintText.toLowerCase();

  // Score each department based on keyword hits
  const departmentScores: Map<ValidDepartment, { hits: number; matchedKeywords: string[]; template: string }> = new Map();

  for (const dept of TAXONOMY) {
    let hits = 0;
    const matched: string[] = [];

    const checkList = language === "Tamil"
      ? [...dept.tamil, ...dept.english]
      : language === "Hindi"
      ? [...dept.hindi, ...dept.english]
      : [...dept.english, ...dept.tamil, ...dept.hindi];

    for (const kw of checkList) {
      if (lower.includes(kw.toLowerCase())) {
        hits++;
        matched.push(kw);
      }
    }

    if (hits > 0) {
      departmentScores.set(dept.department, {
        hits,
        matchedKeywords: matched,
        template: dept.defaultEnglishTemplate,
      });
    }
  }

  const { priority, slaHours } = extractPriority(complaintText);
  const deadline = extractDeadline(complaintText, officialDeadline);

  // If no keywords matched, default to Roads as general public works
  if (departmentScores.size === 0) {
    return {
      detected_language: language,
      issues: [
        {
          department: "Roads",
          issue_text: complaintText.length > 10 && language === "English"
            ? complaintText.slice(0, 200)
            : "General municipal civic grievance reported regarding public infrastructure.",
          deadline,
          priority: "medium",
          sla_hours: 48,
        },
      ],
    };
  }

  // Generate distinct issues for each department matched
  const issues: RuleBasedIssue[] = [];
  for (const [dept, data] of departmentScores.entries()) {
    let englishText = data.template;
    if (language === "English" && complaintText.length < 150) {
      englishText = complaintText;
    }

    issues.push({
      department: dept,
      issue_text: englishText,
      deadline,
      priority,
      sla_hours: slaHours,
    });
  }

  return {
    detected_language: language,
    issues,
  };
}
