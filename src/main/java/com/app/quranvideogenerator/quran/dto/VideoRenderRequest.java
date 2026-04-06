package com.app.quranvideogenerator.quran.dto;

public record VideoRenderRequest(
        int chapterId,
        int fromVerse,
        int toVerse,
        int translationId,
        int recitationId,
        String script,
        String backgroundType,
        String backgroundMimeType,
        String backgroundUrl,
        String backgroundDataUrl,
        int contentOpacity,
        int verseFontSize
) {
}
