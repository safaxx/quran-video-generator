package com.app.quranvideogenerator.quran.dto;

public record VerseDto(
        Integer verseNumber,
        String verseKey,
        String arabic,
        String translation
) {
}
