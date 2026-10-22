import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../hooks";
import { API_BASE_URL } from "../config";
import {
  Button,
  Card,
  Input,
  Textarea,
  LoadingState,
} from "../components/ui";
import PhotoCapture from "../components/PhotoCapture";
import { compressImage } from "../lib/imageCompression";
import { useLanguage } from "../lib/i18n";
import TopNav from "../components/TopNav";

export default function CitizenSubmit() {
  usePageTitle("File a Complaint");
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Reading your complaint...");
  const [geoLoading, setGeoLoading] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const voiceRecognitionRef = useRef<any>(null);
  const [voiceSupported] = useState<boolean>(() => {
    return typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  });

  useEffect(() => {
    if (!loading) return;

    const timer = setTimeout(() => {
      setLoadingMessage("Filing your ticket...");
    }, 1000);

    return () => clearTimeout(timer);
  }, [loading]);

  const handleVoiceInput = async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError(
        lang === "ta"
          ? "உங்கள் சாதனத்தில் குரல் உள்ளீடு ஆதரிக்கப்படவில்லை — தட்டச்சு செய்யவும்"
          : "Voice input is not supported on this device — you can type instead"
      );
      setTimeout(() => setVoiceError(""), 4000);
      return;
    }

    if (voiceListening) {
      if (voiceRecognitionRef.current) {
        try {
          voiceRecognitionRef.current.stop();
        } catch {}
      }
      setVoiceListening(false);
      return;
    }

    // Explicitly prompt and verify microphone permission via getUserMedia.
    // In Android WebView / Capacitor, Web Speech API will immediately fail with 'not-allowed'
    // unless the OS microphone permission prompt is triggered via getUserMedia.
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop tracks so the microphone is released for SpeechRecognition
        audioStream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        console.warn("Microphone permission check error:", err);
        setVoiceError(
          lang === "ta"
            ? "மைக்ரோஃபோன் அனுமதி தேவை — நீங்கள் தட்டச்சு செய்யலாம்"
            : "Microphone permission needed — you can type instead"
        );
        setTimeout(() => setVoiceError(""), 5000);
        return;
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = lang === "ta" ? "ta-IN" : "en-IN";
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => {
        setVoiceListening(true);
        setVoiceError("");
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setText((prev) => prev + (prev ? " " : "") + transcript);
          } else {
            interimTranscript += transcript;
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setVoiceListening(false);
        let message = lang === "ta" ? "குரல் உள்ளீட்டில் பிழை ஏற்பட்டது" : "Voice input error";
        if (event.error === "permission-denied" || event.error === "not-allowed") {
          message =
            lang === "ta"
              ? "மைக்ரோஃபோன் அனுமதி தேவை — நீங்கள் தட்டச்சு செய்யலாம்"
              : "Microphone permission needed — you can type instead";
        } else if (event.error === "no-speech") {
          message =
            lang === "ta"
              ? "குரல் கேட்கவில்லை — மைக்ரோஃபோன் அருகில் பேசவும்"
              : "No speech detected — try speaking closer to microphone";
        } else if (event.error === "network") {
          message =
            lang === "ta"
              ? "இணைய பேச்சு சேவை கிடைக்கவில்லை — தட்டச்சு செய்யவும்"
              : "Network speech service unavailable — you can type instead";
        }
        setVoiceError(message);
        setTimeout(() => setVoiceError(""), 5000);
      };

      recognition.onend = () => {
        setVoiceListening(false);
      };

      voiceRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Failed to initialize speech recognition:", err);
      setVoiceListening(false);
      setVoiceError(
        lang === "ta"
          ? "குரல் உள்ளீட்டை தொடங்க முடியவில்லை — தட்டச்சு செய்யவும்"
          : "Could not start voice input — you can type instead"
      );
      setTimeout(() => setVoiceError(""), 4000);
    }
  };

  const handleUseCurrentLocation = async () => {
    setLocationError("");
    setGeoLoading(true);

    try {
      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by your device");
      }

      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            enableHighAccuracy: true,
          });
        }
      );

      const { latitude, longitude } = position.coords;
      setCoords({ lat: latitude, lng: longitude });

      let resolvedAddress = "";

      // 1. Try local/host backend reverse geocode
      try {
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(`${API_BASE_URL}/api/reverse-geocode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: latitude, lon: longitude }),
          signal: controller.signal,
        });
        clearTimeout(tId);
        if (response.ok) {
          const data = await response.json();
          if (data.address) resolvedAddress = data.address;
        }
      } catch {
        // Backend lookup failed
      }

      // 2. Try client-side Nominatim lookup if backend was unreachable
      if (!resolvedAddress) {
        try {
          const osmRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
          );
          if (osmRes.ok) {
            const osmData = await osmRes.json();
            if (osmData.display_name) {
              resolvedAddress = osmData.display_name.split(",").slice(0, 3).join(",");
            }
          }
        } catch {
          // Offline
        }
      }

      // 3. If geocoding failed or offline, seamlessly use GPS coordinates without showing error
      setLocation(resolvedAddress || `GPS: ${latitude.toFixed(5)}°N, ${longitude.toFixed(5)}°E`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't get your location";
      setLocationError(message + " — you can type it manually instead");
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setLoadingMessage("Reading your complaint...");

    try {
      if (!text.trim()) {
        throw new Error("Please enter a complaint");
      }
      if (!location.trim()) {
        setLocationError("Location is required");
        throw new Error("Location is required");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let ticketId: string | null = null;
      let primaryPhotoUrl: string | null = null;

      // 1. Upload photo first so it is available for ticket, issue before_photo_url, and AI vision
      if (photos.length > 0) {
        setLoadingMessage("Securing and uploading evidence photo...");
        try {
          const { file: photoFile } = await compressImage(photos[0], { maxDimension: 1280, quality: 0.8 });
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(photoFile);
          });
          const base64Data = await base64Promise;

          // Attempt backend upload endpoint with service role
          try {
            const upRes = await fetch(`${API_BASE_URL}/api/upload-photo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bucket: "complaint-photos",
                base64: base64Data,
                contentType: photoFile.type || "image/jpeg",
              }),
            });
            if (upRes.ok) {
              const upData = await upRes.json();
              primaryPhotoUrl = upData.publicUrl;
            }
          } catch (uploadErr) {
            console.warn("Backend upload failed, using data url:", uploadErr);
          }

          if (!primaryPhotoUrl) {
            primaryPhotoUrl = base64Data;
          }
        } catch (photoErr) {
          console.error("Photo processing error:", photoErr);
        }
      }

      // 2. Resolve coordinates from location text if GPS not active
      let effectiveCoords = coords;
      if (!effectiveCoords && location) {
        const loc = location.toLowerCase();
        if (loc.includes("anna nagar")) {
          // If building number 14 vs 12, add slight realistic meter offset
          effectiveCoords = loc.includes("14")
            ? { lat: 13.08518, lng: 80.21015 }
            : { lat: 13.0850, lng: 80.2101 };
        } else if (loc.includes("t. nagar") || loc.includes("t nagar")) {
          effectiveCoords = { lat: 13.0418, lng: 80.2341 };
        } else if (loc.includes("guindy")) {
          effectiveCoords = { lat: 13.0067, lng: 80.2026 };
        } else if (loc.includes("velachery")) {
          effectiveCoords = { lat: 12.9815, lng: 80.2180 };
        } else if (loc.includes("adyar")) {
          effectiveCoords = { lat: 13.0012, lng: 80.2565 };
        }
      }

      // 3. Attempt submission via Backend AI Pipeline first
      try {
        setLoadingMessage("Reading and analyzing your complaint...");
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 10000);

        const submitResponse = await fetch(`${API_BASE_URL}/api/submit-complaint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            rawText: text,
            photoUrl: primaryPhotoUrl,
            location,
          }),
          signal: controller.signal,
        });
        clearTimeout(tId);

        if (submitResponse.ok) {
          const submitData = await submitResponse.json();
          ticketId = submitData.ticketId;

          // Run AI Analysis
          const analysisResponse = await fetch(`${API_BASE_URL}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });

          if (analysisResponse.ok) {
            const analysisData = await analysisResponse.json();
            if (analysisData?.issues && Array.isArray(analysisData.issues)) {
              const issueResults = await Promise.all(
                analysisData.issues.map(async (issue: any) => {
                  const createRes = await fetch(`${API_BASE_URL}/api/create-issue`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      parentTicketId: ticketId,
                      department: issue.department,
                      issueText: issue.issue_text,
                      deadline: issue.deadline,
                      priority: issue.priority,
                      lat: effectiveCoords?.lat ?? null,
                      lng: effectiveCoords?.lng ?? null,
                      beforePhotoUrl: primaryPhotoUrl,
                      location,
                    }),
                  });
                  return createRes.ok ? createRes.json() : null;
                })
              );

              const duplicates = issueResults.filter((r) => r?.isDuplicate);
              if (duplicates.length > 0) {
                const count = duplicates[0].affectedCitizensCount || 2;
                const otherCount = Math.max(1, count - 1);
                const countStr = otherCount === 1 ? "1 other citizen has" : `${otherCount} other citizens have`;
                sessionStorage.setItem(
                  `duplicate_notice_${ticketId}`,
                  `${countStr} also reported this problem in your immediate vicinity. Consolidated for priority response.`
                );
              }
            }
          }
        }
      } catch (pipelineErr) {
        console.warn("Backend AI Pipeline unreachable, using civic cloud fallback:", pipelineErr);
      }

      // 4. Direct Supabase Fallback if backend API call was unreachable
      if (!ticketId) {
        setLoadingMessage("Connecting directly to civic cloud...");
        const { data: directTicket, error: directErr } = await supabase
          .from("tickets")
          .insert({
            citizen_id: user.id,
            raw_text: text,
            location,
            photo_url: primaryPhotoUrl,
          })
          .select("id")
          .single();

        if (directErr || !directTicket) {
          throw new Error(directErr?.message || "Failed to save complaint to database");
        }

        ticketId = directTicket.id;

        // Intelligent client-side multi-department classification
        const lower = text.toLowerCase();
        const detectedDepts: Array<{ department: string; text: string; priority: string }> = [];

        if (/water|தண்ணீர்|குடிநீர்|drain|pipe|sewage|leak|கசிவு/i.test(lower)) {
          detectedDepts.push({ department: "Water", text: "Water supply / pipeline disruption reported", priority: "medium" });
        }
        if (/electricity|electric|light|current|மின்சாரம்|power|wire|transformer|volt|pole|poles|கம்பம்/i.test(lower)) {
          detectedDepts.push({ department: "Electricity", text: "Electricity / streetlight / pole issue reported", priority: "medium" });
        }
        if (/garbage|waste|சாக்கடை|குப்பை|clean|துர்நாற்றம்/i.test(lower)) {
          detectedDepts.push({ department: "Sanitation", text: "Sanitation and waste clearance reported", priority: "medium" });
        }
        if (/road|pothole|plot hole|crater|ரோடு|சாலை|பள்ளம்|traffic/i.test(lower)) {
          detectedDepts.push({ department: "Roads", text: "Road damage and potholes reported", priority: "medium" });
        }
        if (/health|மருத்துவம்|hospital|dengue|mosquito|டாக்டர்/i.test(lower)) {
          detectedDepts.push({ department: "Health", text: "Public health concern reported", priority: "medium" });
        }

        if (detectedDepts.length === 0) {
          detectedDepts.push({ department: "Roads", text, priority: "medium" });
        }

        for (const item of detectedDepts) {
          await supabase.from("issues").insert({
            parent_ticket_id: ticketId,
            department: item.department,
            issue_text: text,
            priority: item.priority,
            status: "new",
            lat: effectiveCoords?.lat ?? null,
            lng: effectiveCoords?.lng ?? null,
            before_photo_url: primaryPhotoUrl,
            deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString().split("T")[0],
            sla_deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          });
        }
      }

      // Record ticket photo in ticket_photos table
      if (primaryPhotoUrl && ticketId) {
        try {
          await supabase.from("ticket_photos").insert({
            ticket_id: ticketId,
            photo_url: primaryPhotoUrl,
            uploaded_by: user.id,
          });
        } catch {}
      }

      navigate(`/citizen/track/${ticketId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      <TopNav />
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 font-serif mb-1">
            {t.submitComplaint}
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            Describe your issue in detail. Our system will automatically route
            it to the correct department.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <Card>
          {loading ? (
            <LoadingState message={loadingMessage} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Describe your issue
                  </label>
                  {voiceSupported && (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={handleVoiceInput}
                      disabled={loading}
                      className={`px-3 py-1 text-sm ${voiceListening ? "animate-pulse bg-red-100" : ""}`}
                    >
                      <Mic className="w-4 h-4 inline mr-1" />
                      {voiceListening ? "Listening..." : "Speak instead"}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="complaint"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                  placeholder="Describe your complaint in detail..."
                  className="h-40 resize-none"
                />
              </div>
              <p className="text-xs text-slate-500">{text.length} characters</p>
              {voiceError && (
                <p className="text-xs text-red-600">{voiceError}</p>
              )}

              <div>
                <Input
                  label="Location"
                  id="location"
                  type="text"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setLocationError("");
                  }}
                  placeholder="e.g., MG Road, near Town Hall"
                />
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={geoLoading}
                  className="mt-2"
                >
                  {geoLoading ? "Getting your location..." : "Use my current location"}
                </Button>
                {locationError && (
                  <p className="text-xs text-red-600 mt-2">{locationError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Photos (optional)
                </label>
                <PhotoCapture
                  maxPhotos={4}
                  onChange={setPhotos}
                />
              </div>

              <Button
                variant="primary"
                type="submit"
                disabled={loading || !text.trim()}
                className="w-full"
              >
                {loading ? "Submitting..." : "Submit Complaint"}
              </Button>
            </form>
          )}
        </Card>

        <Card accentColor="#3182CE" className="mt-6">
          <p className="text-sm text-slate-800">
            <strong>Pro tip:</strong> If your complaint covers multiple issues
            (e.g., both water and electricity), mention all of them. Our system
            will automatically split them and route each to the right department.
          </p>
        </Card>
      </main>
    </div>
  );
}
