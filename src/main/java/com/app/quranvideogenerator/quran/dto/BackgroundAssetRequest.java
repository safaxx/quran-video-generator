package com.app.quranvideogenerator.quran.dto;

public record BackgroundAssetRequest(
        String type,
        String mimeType,
        String backgroundUrl,
        String backgroundDataUrl
) {
}
