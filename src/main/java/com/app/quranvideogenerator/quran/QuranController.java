package com.app.quranvideogenerator.quran;

import com.app.quranvideogenerator.quran.dto.ChapterOption;
import com.app.quranvideogenerator.quran.dto.ChapterAudioDto;
import com.app.quranvideogenerator.quran.dto.RecitationOption;
import com.app.quranvideogenerator.quran.dto.TranslationOption;
import com.app.quranvideogenerator.quran.dto.VerseDto;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping(value = "/api/quran", produces = MediaType.APPLICATION_JSON_VALUE + ";charset=UTF-8")
public class QuranController {

    private final QuranDataService quranDataService;

    public QuranController(QuranDataService quranDataService) {
        this.quranDataService = quranDataService;
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
}
