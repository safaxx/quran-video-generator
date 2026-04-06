package com.app.quranvideogenerator.quran;

import com.app.quranvideogenerator.quran.dto.ChapterOption;
import com.app.quranvideogenerator.quran.dto.ChapterAudioDto;
import com.app.quranvideogenerator.quran.dto.RecitationOption;
import com.app.quranvideogenerator.quran.dto.TranslationOption;
import com.app.quranvideogenerator.quran.dto.VerseDto;
import com.app.quranvideogenerator.quran.dto.VideoRenderRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping(value = "/api/quran", produces = MediaType.APPLICATION_JSON_VALUE + ";charset=UTF-8")
public class QuranController {

    private final QuranDataService quranDataService;
    private final VideoRenderService videoRenderService;

    public QuranController(QuranDataService quranDataService, VideoRenderService videoRenderService) {
        this.quranDataService = quranDataService;
        this.videoRenderService = videoRenderService;
    }

    @GetMapping("/chapters")
    public List<ChapterOption> chapters() {
        return quranDataService.getChapters();
    }

    @GetMapping("/recitations")
    public List<RecitationOption> recitations() {
        return quranDataService.getRecitations();
    }

    @GetMapping("/translations")
    public List<TranslationOption> translations(@RequestParam(defaultValue = "english") String language) {
        return quranDataService.getTranslations(language);
    }

    @GetMapping("/verses")
    public List<VerseDto> verses(
            @RequestParam int chapterId,
            @RequestParam int fromVerse,
            @RequestParam int toVerse,
            @RequestParam int translationId,
            @RequestParam(defaultValue = "uthmani") String script
    ) {
        return quranDataService.getVerses(chapterId, fromVerse, toVerse, translationId, script);
    }

    @GetMapping("/chapter-audio")
    public ChapterAudioDto chapterAudio(
            @RequestParam int chapterId,
            @RequestParam int recitationId
    ) {
        return quranDataService.getChapterAudio(chapterId, recitationId);
    }

    @PostMapping(value = "/export", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<byte[]> export(@RequestBody VideoRenderRequest request) {
        byte[] videoBytes = videoRenderService.render(request);
        String filename = "quran-video-" + request.chapterId() + "-" + request.fromVerse() + "-" + request.toVerse() + ".mp4";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(videoBytes);
    }
}
