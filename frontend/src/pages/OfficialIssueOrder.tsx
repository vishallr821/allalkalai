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
  Badge,
} from "../components/ui";
import PhotoCapture from "../components/PhotoCapture";

export default function OfficialIssueOrder() {
  usePageTitle("Issue Government Order");
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Reading your order...");
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
      setLoadingMessage("Filing your order...");
    }, 1000);

    return () => clearTimeout(timer);
  }, [loading]);

  const handleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    if (voiceListening) {
      if (voiceRecognitionRef.current) {
        voiceRecognitionRef.current.stop();
      }
      setVoiceListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
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
      let message = "Voice input error";
      if (event.error === "permission-denied") {
        message = "Microphone permission denied — you can type instead";
      } else if (event.error === "no-speech") {
        message = "No speech detected — try again or type instead";
      } else if (event.error === "network") {
        message = "Network error — please try again";
      }
      setVoiceError(message);
    };

    recognition.onend = () => {
      setVoiceListening(false);
    };

    voiceRecognitionRef.current = recognition;
    recognition.start();
  };

  const handleUseCurrentLocation = async () => {
    setLocationError("");
    setGeoLoading(true);

    try {
      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by your browser");
      }

      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
          });
        }
      );

      const { latitude, longitude } = position.coords;

      const response = await fetch(`${API_BASE_URL}/api/reverse-geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: latitude, lon: longitude }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Failed to get address: ${response.statusText}`
        );
      }

      const data = await response.json();
      setLocation(data.address);
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
    setLoadingMessage("Reading your order...");

    try {
      if (!text.trim()) {
        throw new Error("Please enter an order description");
      }
      if (!deadline) {
        throw new Error("Deadline is required for government orders");
      }
      if (!location.trim()) {
        setLocationError("Location is required");
        throw new Error("Location is required");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const complaintText = `${text}\n\nDeadline specified by official: ${deadline}`;

      const submitResponse = await fetch(`${API_BASE_URL}/api/submit-complaint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          rawText: text,
          photoUrl: null,
          location,
        }),
      });

      if (!submitResponse.ok) {
        const errorData = await submitResponse.json();
        throw new Error(
          errorData.error || `Backend error: ${submitResponse.statusText}`
        );
      }

      const submitData = await submitResponse.json();
      const ticketId = submitData.ticketId;

      const analysisResponse = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: complaintText }),
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.json();
        throw new Error(
          errorData.error || `Backend error: ${analysisResponse.statusText}`
        );
      }

      const analysisData = await analysisResponse.json();

      if (
        !analysisData ||
        !analysisData.issues ||
        !Array.isArray(analysisData.issues)
      ) {
        throw new Error(
          "Invalid response from analysis: " + JSON.stringify(analysisData)
        );
      }

      const issues = await Promise.all(
        analysisData.issues.map((issue: any) =>
          supabase.from("issues").insert({
            parent_ticket_id: ticketId,
            department: issue.department,
            issue_text: issue.issue_text,
            deadline: deadline,
            priority: issue.priority,
            status: "new",
          })
        )
      );

      if (issues.some((result) => result.error)) {
        throw new Error("Failed to create issues");
      }

      if (photos.length > 0) {
        for (const photoFile of photos) {
          try {
            const fileExt = photoFile.name.split(".").pop() || "jpg";
            const fileName = `ticket-photos/${ticketId}/${crypto.randomUUID()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
              .from("complaint-photos")
              .upload(fileName, photoFile);

            if (uploadError) {
              console.error(`Failed to upload photo ${photoFile.name}:`, uploadError);
              continue;
            }

            const { data } = supabase.storage
              .from("complaint-photos")
              .getPublicUrl(fileName);

            await supabase.from("ticket_photos").insert({
              ticket_id: ticketId,
              photo_url: data.publicUrl,
              uploaded_by: user.id,
            });
          } catch (photoErr) {
            console.error(`Error processing photo ${photoFile.name}:`, photoErr);
          }
        }
      }

      navigate(`/official/track/${ticketId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      <main className="max-w-xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-semibold text-slate-800">
              Issue Government Order
            </h1>
            <Badge label="Official Order" color="#1A202C" />
          </div>
          <p className="text-slate-500">
            Issue an official government order with automatic department routing.
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
                    Order Description
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
                  id="order"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                  placeholder="Describe the official order in detail..."
                  className="h-40 resize-none"
                />
              </div>
              <p className="text-xs text-slate-500">{text.length} characters</p>
              {voiceError && (
                <p className="text-xs text-red-600">{voiceError}</p>
              )}

              <Input
                label="Deadline (required)"
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />

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
                  placeholder="e.g., Main Street, entire city"
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
                  Documents/Photos (optional)
                </label>
                <PhotoCapture
                  maxPhotos={4}
                  onChange={setPhotos}
                />
              </div>

              <Button
                variant="primary"
                type="submit"
                disabled={loading || !text.trim() || !deadline}
                className="w-full"
              >
                {loading ? "Issuing..." : "Issue Order"}
              </Button>
            </form>
          )}
        </Card>

        <Card accentColor="#3182CE" className="mt-6">
          <p className="text-sm text-slate-800">
            <strong>Note:</strong> Government orders are automatically routed to
            relevant departments. Each department will receive tasks based on the
            order description and the specified deadline.
          </p>
        </Card>
      </main>
    </div>
  );
}
