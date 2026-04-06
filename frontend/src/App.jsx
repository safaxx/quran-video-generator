import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const backgrounds = [
  {
    id: "bg-1",
    name: "",
    type: "image",
    mimeType: "image/jpeg",
    source:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
    preview:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "bg-2",
    name: "",
    type: "image",
    mimeType: "image/jpeg",
    source:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80",
    preview:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80"
  }
];

async function fetchJson(url) {
  const response = await fetch(`${API_BASE_URL}${url}`);
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const error = await response.json();
      throw new Error(error.message ?? "Request failed");
    }

    throw new Error("Request failed");
  }

  return response.json();
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The selected media could not be read."));
    reader.readAsDataURL(file);
  });
}

async function fetchMediaAsDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("The selected background media could not be prepared for export.");
  }

  const blob = await response.blob();
  return readFileAsDataUrl(blob);
}

function isGifBackground(background) {
  return background?.mimeType === "image/gif" || background?.source?.toLowerCase().includes(".gif");
}

function App() {
  const [chapters, setChapters] = useState([]);
  const [recitations, setRecitations] = useState([]);
  const [translations, setTranslations] = useState([]);
  const [verses, setVerses] = useState([]);
  const [chapterAudio, setChapterAudio] = useState(null);
  const [selectedSurahId, setSelectedSurahId] = useState("");
  const [fromVerse, setFromVerse] = useState(1);
  const [toVerse, setToVerse] = useState(1);
  const [selectedReciterId, setSelectedReciterId] = useState("");
  const [selectedTranslationId, setSelectedTranslationId] = useState("");
  const [selectedBackgroundId, setSelectedBackgroundId] = useState(backgrounds[0].id);
  const [customBackground, setCustomBackground] = useState(null);
  const [selectedArabicScript, setSelectedArabicScript] = useState("uthmani");
  const [activeVerseNumber, setActiveVerseNumber] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [contentOpacity, setContentOpacity] = useState(68);
  const [verseFontSize, setVerseFontSize] = useState(42);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingVerses, setLoadingVerses] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const audioRef = useRef(null);
  const uploadInputRef = useRef(null);

  const selectedSurah = useMemo(
    () => chapters.find((surah) => surah.id === Number(selectedSurahId)) ?? null,
    [chapters, selectedSurahId]
  );

  const verseOptions = useMemo(() => {
    if (!selectedSurah) {
      return [];
    }

    return Array.from({ length: selectedSurah.versesCount }, (_, index) => index + 1);
  }, [selectedSurah]);

  const selectedReciter = useMemo(
    () => recitations.find((reciter) => reciter.id === Number(selectedReciterId)) ?? null,
    [recitations, selectedReciterId]
  );

  const selectedTranslation = useMemo(
    () => translations.find((translation) => translation.id === Number(selectedTranslationId)) ?? null,
    [translations, selectedTranslationId]
  );

  const availableBackgrounds = useMemo(
    () => (customBackground ? [customBackground, ...backgrounds] : backgrounds),
    [customBackground]
  );

  const selectedBackground =
    availableBackgrounds.find((background) => background.id === selectedBackgroundId) ?? availableBackgrounds[0];

  const activeVerse = verses.find((verse) => verse.verseNumber === activeVerseNumber) ?? verses[0] ?? null;
  const activeVerseIndex = verses.findIndex((verse) => verse.verseNumber === activeVerseNumber);

  const filteredAudioTimestamps = useMemo(() => {
    if (!chapterAudio?.timestamps) {
      return [];
    }

    return chapterAudio.timestamps.filter(
      (timestamp) => timestamp.verseNumber >= fromVerse && timestamp.verseNumber <= toVerse
    );
  }, [chapterAudio, fromVerse, toVerse]);

  const selectedAudioStartSeconds =
    filteredAudioTimestamps.length > 0 ? filteredAudioTimestamps[0].timestampFrom / 1000 : 0;
  const selectedAudioEndSeconds =
    filteredAudioTimestamps.length > 0
      ? filteredAudioTimestamps[filteredAudioTimestamps.length - 1].timestampTo / 1000
      : 0;

  const fallbackTotalSeconds = verses.length * 4;
  const currentAudioSeconds = audioRef.current?.currentTime ?? 0;
  const hasAudioRange = filteredAudioTimestamps.length > 0 && selectedAudioEndSeconds > selectedAudioStartSeconds;
  const totalPlaybackSeconds = hasAudioRange
    ? selectedAudioEndSeconds - selectedAudioStartSeconds
    : fallbackTotalSeconds;
  const currentPlaybackSeconds = hasAudioRange
    ? Math.min(Math.max(currentAudioSeconds - selectedAudioStartSeconds, 0), totalPlaybackSeconds)
    : Math.min(Math.max(activeVerseIndex, 0) * 4, totalPlaybackSeconds);
  const playbackProgress =
    totalPlaybackSeconds > 0 ? (currentPlaybackSeconds / totalPlaybackSeconds) * 100 : 0;

  useEffect(() => {
    return () => {
      if (customBackground?.source?.startsWith("blob:")) {
        URL.revokeObjectURL(customBackground.source);
      }
    };
  }, [customBackground]);

  useEffect(() => {
    let isMounted = true;

    async function loadMeta() {
      setLoadingMeta(true);
      setErrorMessage("");

      try {
        const [chapterData, recitationData, translationData] = await Promise.all([
          fetchJson("/api/quran/chapters"),
          fetchJson("/api/quran/recitations"),
          fetchJson("/api/quran/translations?language=english")
        ]);

        if (!isMounted) {
          return;
        }

        setChapters(chapterData);
        setRecitations(recitationData);
        setTranslations(translationData);

        if (chapterData.length > 0) {
          setSelectedSurahId(String(chapterData[0].id));
          setFromVerse(1);
          setToVerse(Math.min(3, chapterData[0].versesCount));
          setActiveVerseNumber(1);
        }

        if (recitationData.length > 0) {
          setSelectedReciterId(String(recitationData[0].id));
        }

        if (translationData.length > 0) {
          setSelectedTranslationId(String(translationData[0].id));
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error.message);
        }
      } finally {
        if (isMounted) {
          setLoadingMeta(false);
        }
      }
    }

    loadMeta();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedSurah) {
      return;
    }

    setFromVerse((current) => Math.min(Math.max(1, current), selectedSurah.versesCount));
    setToVerse((current) => Math.min(Math.max(1, current), selectedSurah.versesCount));
  }, [selectedSurah]);

  useEffect(() => {
    if (fromVerse > toVerse) {
      setToVerse(fromVerse);
    }
  }, [fromVerse, toVerse]);

  useEffect(() => {
    if (!selectedSurahId || !selectedTranslationId || !selectedReciterId) {
      return;
    }

    let isMounted = true;

    async function loadVerses() {
      setLoadingVerses(true);
      setErrorMessage("");

      try {
        const verseData = await fetchJson(
          `/api/quran/verses?chapterId=${selectedSurahId}&fromVerse=${fromVerse}&toVerse=${toVerse}&translationId=${selectedTranslationId}&script=${selectedArabicScript}`
        );

        if (!isMounted) {
          return;
        }

        setVerses(verseData);
        if (verseData.length > 0) {
          setActiveVerseNumber(verseData[0].verseNumber);
        }
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      } catch (error) {
        if (isMounted) {
          setVerses([]);
          setErrorMessage(error.message);
        }
      } finally {
        if (isMounted) {
          setLoadingVerses(false);
        }
      }
    }

    loadVerses();

    return () => {
      isMounted = false;
    };
  }, [
    selectedSurahId,
    fromVerse,
    toVerse,
    selectedTranslationId,
    selectedArabicScript,
    selectedReciterId
  ]);

  useEffect(() => {
    if (!selectedSurahId || !selectedReciterId) {
      return;
    }

    let isMounted = true;

    async function loadChapterAudio() {
      try {
        const audioData = await fetchJson(
          `/api/quran/chapter-audio?chapterId=${selectedSurahId}&recitationId=${selectedReciterId}`
        );

        if (isMounted) {
          setChapterAudio(audioData);
        }
      } catch {
        if (isMounted) {
          setChapterAudio(null);
        }
      }
    }

    loadChapterAudio();

    return () => {
      isMounted = false;
    };
  }, [selectedSurahId, selectedReciterId]);

  useEffect(() => {
    if (!isPlaying || verses.length <= 1 || activeVerseIndex < 0 || chapterAudio?.audioUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (activeVerseIndex >= verses.length - 1) {
        setIsPlaying(false);
        return;
      }

      setActiveVerseNumber(verses[activeVerseIndex + 1].verseNumber);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [isPlaying, activeVerseIndex, verses, chapterAudio]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!chapterAudio?.audioUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    if (audio.src !== chapterAudio.audioUrl) {
      audio.src = chapterAudio.audioUrl;
      audio.load();
    }

    if (isPlaying) {
      if (
        filteredAudioTimestamps.length > 0 &&
        (audio.currentTime < selectedAudioStartSeconds || audio.currentTime >= selectedAudioEndSeconds)
      ) {
        audio.currentTime = selectedAudioStartSeconds;
      }

      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [chapterAudio, isPlaying, filteredAudioTimestamps, selectedAudioStartSeconds, selectedAudioEndSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !chapterAudio?.audioUrl || filteredAudioTimestamps.length === 0) {
      return;
    }

    const currentTimestamp =
      filteredAudioTimestamps.find((timestamp) => timestamp.verseNumber === activeVerseNumber) ??
      filteredAudioTimestamps[0];

    if (!currentTimestamp) {
      return;
    }

    const targetSeconds = currentTimestamp.timestampFrom / 1000;
    if (Math.abs(audio.currentTime - targetSeconds) > 0.35 && !isPlaying) {
      audio.currentTime = targetSeconds;
    }
  }, [activeVerseNumber, chapterAudio, filteredAudioTimestamps, isPlaying]);

  const handleUploadMedia = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      window.alert("Please upload an image or video file.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const objectUrl = URL.createObjectURL(file);

      if (customBackground?.source?.startsWith("blob:")) {
        URL.revokeObjectURL(customBackground.source);
      }

      const uploadedBackground = {
        id: "bg-uploaded",
        name: file.name.replace(/\.[^.]+$/, "") || "Uploaded media",
        type: isVideo ? "video" : "image",
        mimeType: file.type,
        source: objectUrl,
        preview: objectUrl,
        exportSource: dataUrl
      };

      setCustomBackground(uploadedBackground);
      setSelectedBackgroundId(uploadedBackground.id);
    } catch (error) {
      window.alert(error.message ?? "The selected media could not be loaded.");
    } finally {
      event.target.value = "";
    }
  };

  const handleDownload = async () => {
    if (isDownloading || !selectedSurah || !activeVerse || verses.length === 0) {
      return;
    }

    if (!chapterAudio?.audioUrl || filteredAudioTimestamps.length === 0) {
      window.alert("Audio timing is not ready yet for this selection. Please try again in a moment.");
      return;
    }

    let objectUrl;

    try {
      setIsDownloading(true);
      const backgroundDataUrl =
        selectedBackground.exportSource ??
        (selectedBackground.type === "video" || isGifBackground(selectedBackground)
          ? await fetchMediaAsDataUrl(selectedBackground.source)
          : "");

      const response = await fetch(`${API_BASE_URL}/api/quran/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chapterId: Number(selectedSurahId),
          fromVerse,
          toVerse,
          translationId: Number(selectedTranslationId),
          recitationId: Number(selectedReciterId),
          script: selectedArabicScript,
          backgroundType: selectedBackground.type,
          backgroundMimeType: selectedBackground.mimeType ?? "",
          backgroundUrl: backgroundDataUrl ? "" : selectedBackground.source,
          backgroundDataUrl,
          contentOpacity,
          verseFontSize
        })
      });

      if (!response.ok) {
        let message = "Video export failed.";

        try {
          const errorPayload = await response.json();
          if (errorPayload?.message) {
            message = errorPayload.message;
          }
        } catch {
          message = `Video export failed (${response.status}).`;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${selectedSurah.nameSimple.toLowerCase().replace(/\s+/g, "-")}-${fromVerse}-${toVerse}.mp4`;
      link.click();
    } catch (error) {
      window.alert(error.message ?? "Video export failed.");
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setIsDownloading(false);
    }
  };

  const handlePlayPause = () => {
    if (verses.length === 0) {
      return;
    }

    if (!isPlaying && activeVerseIndex === verses.length - 1) {
      setActiveVerseNumber(verses[0].verseNumber);
    }

    if (!isPlaying && chapterAudio?.audioUrl && filteredAudioTimestamps.length > 0 && audioRef.current) {
      const currentTimestamp =
        filteredAudioTimestamps.find((timestamp) => timestamp.verseNumber === activeVerseNumber) ??
        filteredAudioTimestamps[0];

      if (
        !currentTimestamp ||
        audioRef.current.currentTime < selectedAudioStartSeconds ||
        audioRef.current.currentTime >= selectedAudioEndSeconds
      ) {
        audioRef.current.currentTime = (currentTimestamp ?? filteredAudioTimestamps[0]).timestampFrom / 1000;
      }
    }

    setIsPlaying((current) => !current);
  };

  const handleRestart = () => {
    if (verses.length === 0) {
      return;
    }

    setActiveVerseNumber(verses[0].verseNumber);
    setIsPlaying(false);
    if (audioRef.current) {
      const firstTimestamp = filteredAudioTimestamps[0];
      audioRef.current.currentTime = firstTimestamp ? firstTimestamp.timestampFrom / 1000 : 0;
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  const handleAudioTimeUpdate = () => {
    if (!audioRef.current || filteredAudioTimestamps.length === 0) {
      return;
    }

    const currentMillis = audioRef.current.currentTime * 1000;

    if (audioRef.current.currentTime >= selectedAudioEndSeconds) {
      audioRef.current.pause();
      audioRef.current.currentTime = selectedAudioEndSeconds;
      setActiveVerseNumber(filteredAudioTimestamps[filteredAudioTimestamps.length - 1].verseNumber);
      setIsPlaying(false);
      return;
    }

    const matchingTimestamp = filteredAudioTimestamps.find(
      (timestamp) => currentMillis >= timestamp.timestampFrom && currentMillis < timestamp.timestampTo
    );

    if (matchingTimestamp && matchingTimestamp.verseNumber !== activeVerseNumber) {
      setActiveVerseNumber(matchingTimestamp.verseNumber);
    }
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1 className="eyebrow">Quran Recitation Video Generator</h1>
          {/* <h1>Creating Quran recitation videos has never been easier</h1> */}
          <p className="hero-copy">
            Select a surah, choose the verse range and reciter, style the text, add an image or video
            background, preview the result, and export a shareable video.
          </p>
        </div>
      </header>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <main className="workspace">
        <section className="panel controls-panel">
          <div className="panel-heading">
            <h2>Video Settings</h2>
            <p>Choose the surah, verse range, reciter, and translation for the preview.</p>
          </div>

          <label className="field">
            <span>Surah</span>
            <select
              value={selectedSurahId}
              onChange={(e) => setSelectedSurahId(e.target.value)}
              disabled={loadingMeta || chapters.length === 0}
            >
              {chapters.map((surah) => (
                <option key={surah.id} value={surah.id}>
                  {surah.id}. {surah.nameSimple} ({surah.versesCount} verses)
                </option>
              ))}
            </select>
          </label>

          <div className="field-grid">
            <label className="field">
              <span>From verse</span>
              <select value={fromVerse} onChange={(e) => setFromVerse(Number(e.target.value))}>
                {verseOptions.map((verseNumber) => (
                  <option key={verseNumber} value={verseNumber}>
                    Verse {verseNumber}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>To verse</span>
              <select value={toVerse} onChange={(e) => setToVerse(Number(e.target.value))}>
                {verseOptions
                  .filter((verseNumber) => verseNumber >= fromVerse)
                  .map((verseNumber) => (
                    <option key={verseNumber} value={verseNumber}>
                      Verse {verseNumber}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Reciter</span>
            <select
              value={selectedReciterId}
              onChange={(e) => setSelectedReciterId(e.target.value)}
              disabled={loadingMeta || recitations.length === 0}
            >
              {recitations.map((reciter) => (
                <option key={reciter.id} value={reciter.id}>
                  {reciter.reciterName}
                  {reciter.style ? ` (${reciter.style})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Translation</span>
            <select
              value={selectedTranslationId}
              onChange={(e) => setSelectedTranslationId(e.target.value)}
              disabled={loadingMeta || translations.length === 0}
            >
              {translations.map((translation) => (
                <option key={translation.id} value={translation.id}>
                  {translation.name}
                  {translation.authorName ? ` - ${translation.authorName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Arabic Script</span>
            <select value={selectedArabicScript} onChange={(e) => setSelectedArabicScript(e.target.value)}>
              <option value="uthmani">Uthmani</option>
              <option value="indopak">Indo Pak</option>
            </select>
          </label>

          <label className="field">
            <span>Text Box Opacity</span>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={contentOpacity}
              onChange={(e) => setContentOpacity(Number(e.target.value))}
            />
            <small className="field-help">{contentOpacity}% opacity</small>
          </label>

          <label className="field">
            <span>Arabic Font Size</span>
            <input
              type="range"
              min="28"
              max="72"
              step="2"
              value={verseFontSize}
              onChange={(e) => setVerseFontSize(Number(e.target.value))}
            />
            <small className="field-help">{verseFontSize}px</small>
          </label>

          <button
            type="button"
            className="download-button"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? "Rendering video..." : "Download Video"}
          </button>
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <h2>Video Preview</h2>
            <p>This now plays through the selected verses like a simple video preview.</p>
          </div>

          <div
            className="preview-stage"
          >
            {selectedBackground.type === "video" ? (
              <video
                key={selectedBackground.id}
                className="preview-background-video"
                src={selectedBackground.source}
                autoPlay
                muted
                loop
                playsInline
              />
            ) : isGifBackground(selectedBackground) ? (
              <img
                key={selectedBackground.id}
                className="preview-background-image-element"
                src={selectedBackground.source}
                alt=""
              />
            ) : (
              <img className="preview-background-image-element" src={selectedBackground.source} alt="" />
            )}
            <div className="preview-stage-overlay" />

            <div className="preview-content">
              {loadingVerses ? <article className="verse-card active-verse-card">Loading verses...</article> : null}

              {!loadingVerses && activeVerse ? (
                <article
                  className="verse-card active-verse-card"
                  key={activeVerse.verseNumber}
                  style={{ backgroundColor: `rgba(7, 18, 24, ${contentOpacity / 100})` }}
                >
                  <p className="surah-title">
                    {selectedSurah?.nameArabic ?? "Loading"}
                  </p>
                  <p
                    className="verse-arabic"
                    dir="rtl"
                    lang="ar"
                    translate="no"
                    style={{ fontSize: `${verseFontSize}px` }}
                  >
                    {activeVerse.arabic}
                  </p>
                  <p className="verse-translation">
                    {activeVerse.translation}
                  </p>
                </article>
              ) : null}
            </div>

            <audio
              ref={audioRef}
              crossOrigin="anonymous"
              onEnded={handleAudioEnded}
              onTimeUpdate={handleAudioTimeUpdate}
              preload="auto"
            />

            <div className="video-controls">
              <div className="video-progress-row">
                <span className="timecode">{formatClock(currentPlaybackSeconds)}</span>
                <div className="video-progress-track" aria-hidden="true">
                  <div className="video-progress-fill" style={{ width: `${playbackProgress}%` }} />
                </div>
                <span className="timecode">{formatClock(totalPlaybackSeconds)}</span>
              </div>

              <div className="video-controls-row">
                <div className="transport-group">
                  <button
                    type="button"
                    className="media-control"
                    onClick={handleRestart}
                    aria-label="Restart preview"
                    title="Restart"
                  >
                    <span className="media-icon">|&lt;</span>
                  </button>
                  <button
                    type="button"
                    className="media-control play-control"
                    onClick={handlePlayPause}
                    aria-label={isPlaying ? "Pause preview" : "Play preview"}
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    <span className="media-icon">{isPlaying ? "||" : ">"}</span>
                  </button>
                </div>

                <div className="player-status">
                  <span>
                    {verses.length === 0
                      ? "No verses loaded"
                      : `Verse ${Math.max(activeVerseIndex + 1, 1)} / ${verses.length}`}
                  </span>
                  <span>{isPlaying ? "Playing" : "Paused"}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel media-panel">
          <div className="panel-heading">
            <h2>Background Media</h2>
            <p>Select an image or video to use as the background.</p>
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,video/*,.gif"
            className="media-upload-input"
            onChange={handleUploadMedia}
          />

          <button
            type="button"
            className="upload-media-button"
            onClick={() => uploadInputRef.current?.click()}
          >
            Upload Image, GIF, or Video
          </button>

          <div className="media-grid">
            {availableBackgrounds.map((background) => (
              <button
                key={background.id}
                type="button"
                className={`media-card ${background.id === selectedBackgroundId ? "active" : ""}`}
                onClick={() => setSelectedBackgroundId(background.id)}
              >
                {background.type === "video" ? (
                  <video
                    className="media-card-preview"
                    src={background.preview}
                    muted
                    playsInline
                    loop
                    autoPlay
                  />
                ) : (
                  <img src={background.preview} alt={background.name} />
                )}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
