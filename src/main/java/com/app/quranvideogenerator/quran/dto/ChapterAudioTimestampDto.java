package com.app.quranvideogenerator.quran.dto;

public record ChapterAudioTimestampDto(
        String verseKey,
        Integer verseNumber,
        Long timestampFrom,
        Long timestampTo
) {
}
