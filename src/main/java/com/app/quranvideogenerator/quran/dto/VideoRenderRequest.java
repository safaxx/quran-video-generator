package com.app.quranvideogenerator.quran.dto;

import java.util.List;

public record VideoRenderRequest(
        int chapterId,
        int fromVerse,
        int toVerse,
        int translationId,
        int recitationId,
        String script,
        List<BackgroundAssetRequest> backgrounds,
        int contentOpacity,
        int verseFontSize
) {
}
