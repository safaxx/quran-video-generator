package com.app.quranvideogenerator.quran.dto;

import java.util.List;

public record ChapterAudioDto(
        String audioUrl,
        List<ChapterAudioTimestampDto> timestamps
) {
}
