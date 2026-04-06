import { useEffect, useMemo, useRef, useState } from "react";

const backgrounds = [
  {
    id: "bg-1",
    name: "Golden Desert",
    type: "image",
    preview:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "bg-2",
    name: "Mountain Dawn",
    type: "image",
    preview:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80"
  },
  {
    id: "bg-3",
    name: "Ocean Horizon",
    type: "video",
    preview:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80"
  }
];

async function fetchJson(url) {
  const response = await fetch(url);
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
  const [selectedArabicScript, setSelectedArabicScript] = useState("uthmani");
  const [activeVerseNumber, setActiveVerseNumber] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [secondsPerVerse, setSecondsPerVerse] = useState(4);
  const [contentOpacity, setContentOpacity] = useState(68);
  const [verseFontSize, setVerseFontSize] = useState(42);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingVerses, setLoadingVerses] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const audioRef = useRef(null);

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

  const selectedBackground =
    backgrounds.find((background) => background.id === selectedBackgroundId) ?? backgrounds[0];

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

  const playbackProgress = verses.length === 0 ? 0 : ((Math.max(activeVerseIndex, 0) + 1) / verses.length) * 100;

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
    }, secondsPerVerse * 1000);

    return () => window.clearTimeout(timer);
  }, [isPlaying, activeVerseIndex, verses, secondsPerVerse, chapterAudio]);

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

  const handleDownload = () => {
    window.alert(
      "Next step: this button will call a backend video-render endpoint and download the finished MP4 to your machine."
    );
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
          <p className="eyebrow">Quran Recitation Video Generator</p>
          <h1>Build a simple recitation video editor, one step at a time.</h1>
          <p className="hero-copy">
            The page is now loading surahs, reciters, translations, and verses from live backend API
            endpoints instead of hardcoded Quran data.
          </p>
        </div>
        <div className="hero-chip">Step 2: Live Quran Data</div>
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

          <div className="summary-card">
            <p className="summary-label">Current selection</p>
            <strong>
              {selectedSurah ? selectedSurah.nameSimple : "Loading..."} - Verses {fromVerse}-{toVerse}
            </strong>
            <span>{selectedReciter ? selectedReciter.reciterName : "Loading reciters..."}</span>
            <span>{selectedTranslation ? selectedTranslation.name : "Loading translations..."}</span>
            <span>{selectedArabicScript === "indopak" ? "Indo Pak script" : "Uthmani script"}</span>
          </div>

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

          <button type="button" className="download-button" onClick={handleDownload}>
            Download MP4
          </button>
        </section>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <h2>Video Preview</h2>
            <p>This now plays through the selected verses like a simple video preview.</p>
          </div>

          <div
            className="preview-stage"
            style={{
              backgroundImage: `linear-gradient(rgba(7, 16, 21, 0.35), rgba(7, 16, 21, 0.72)), url(${selectedBackground.preview})`
            }}
          >
            <div className="preview-content">
              {loadingVerses ? <article className="verse-card active-verse-card">Loading verses...</article> : null}

              {!loadingVerses && activeVerse ? (
                <article
                  className="verse-card active-verse-card"
                  key={activeVerse.verseNumber}
                  style={{ backgroundColor: `rgba(7, 18, 24, ${contentOpacity / 100})` }}
                >
                  <p className="surah-title">{selectedSurah?.nameArabic ?? "Loading"}</p>
                  <p
                    className="verse-arabic"
                    dir="rtl"
                    lang="ar"
                    translate="no"
                    style={{ fontSize: `${verseFontSize}px` }}
                  >
                    {activeVerse.arabic}
                  </p>
                  <p className="verse-translation">{activeVerse.translation}</p>
                </article>
              ) : null}
            </div>

            <audio
              ref={audioRef}
              onEnded={handleAudioEnded}
              onTimeUpdate={handleAudioTimeUpdate}
              preload="auto"
            />

            <div className="video-controls">
              <div className="video-progress-row">
                <span className="timecode">
                  {verses.length === 0 ? "0:00" : `${Math.max(activeVerseIndex, 0) * secondsPerVerse}:00`}
                </span>
                <div className="video-progress-track" aria-hidden="true">
                  <div className="video-progress-fill" style={{ width: `${playbackProgress}%` }} />
                </div>
                <span className="timecode">
                  {verses.length === 0 ? "0:00" : `${verses.length * secondsPerVerse}:00`}
                </span>
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

                <label className="inline-timing-control">
                  <span>Speed</span>
                  <select value={secondsPerVerse} onChange={(e) => setSecondsPerVerse(Number(e.target.value))}>
                    {[3, 4, 5, 6, 8].map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds}s
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="panel media-panel">
          <div className="panel-heading">
            <h2>Background Media</h2>
            <p>Select an image or video to use as the background.</p>
          </div>

          <div className="media-grid">
            {backgrounds.map((background) => (
              <button
                key={background.id}
                type="button"
                className={`media-card ${background.id === selectedBackgroundId ? "active" : ""}`}
                onClick={() => setSelectedBackgroundId(background.id)}
              >
                <img src={background.preview} alt={background.name} />
                <div className="media-card-copy">
                  <strong>{background.name}</strong>
                  <span>{background.type}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
