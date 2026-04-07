package com.app.quranvideogenerator.quran;

import com.app.quranvideogenerator.quran.dto.ChapterOption;
import com.app.quranvideogenerator.quran.dto.ChapterAudioDto;
import com.app.quranvideogenerator.quran.dto.ChapterAudioTimestampDto;
import com.app.quranvideogenerator.quran.dto.RecitationOption;
import com.app.quranvideogenerator.quran.dto.TranslationOption;
import com.app.quranvideogenerator.quran.dto.VerseDto;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.StreamSupport;

@Service
public class QuranDataService {

    private static final int DEFAULT_PAGE_SIZE = 100;
    private static final List<Integer> PREFERRED_TRANSLATION_IDS = List.of(85, 84);

    private final QuranFoundationClient client;

    public QuranDataService(QuranFoundationClient client) {
        this.client = client;
    }

    public List<ChapterOption> getChapters() {
        JsonNode root = client.get("/chapters");
        JsonNode chapters = root.path("chapters");

        return StreamSupport.stream(chapters.spliterator(), false)
                .map(node -> new ChapterOption(
                        node.path("id").asInt(),
                        node.path("name_simple").asText(),
                        node.path("name_arabic").asText(),
                        node.path("verses_count").asInt()
                ))
                .sorted(Comparator.comparing(ChapterOption::id))
                .toList();
    }

    public List<RecitationOption> getRecitations() {
        List<JsonNode> allItems = getPaginatedItems("/resources/recitations", "recitations");

        return allItems.stream()
                .map(node -> new RecitationOption(
                        node.path("id").asInt(),
                        node.path("reciter_name").asText(),
                        node.path("style").asText("")
                ))
                .sorted(Comparator.comparing(RecitationOption::reciterName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public List<TranslationOption> getTranslations(String language) {
        List<JsonNode> allItems = getPaginatedItems("/resources/translations", "translations");
        String normalizedLanguage = language == null ? "" : language.trim().toLowerCase(Locale.ROOT);

        return allItems.stream()
                .map(node -> new TranslationOption(
                        node.path("id").asInt(),
                        node.path("name").asText(),
                        node.path("author_name").asText(""),
                        node.path("language_name").asText("")
                ))
                .filter(item -> normalizedLanguage.isBlank()
                        || item.languageName().equalsIgnoreCase(normalizedLanguage))
                .sorted(Comparator
                        .comparingInt((TranslationOption item) -> preferredTranslationRank(item.id()))
                        .thenComparing(TranslationOption::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public List<VerseDto> getVerses(int chapterId, int fromVerse, int toVerse, int translationId, String script) {
        String wordField = resolveWordField(script);
        String path = UriComponentsBuilder.fromPath("/verses/by_chapter/{chapterId}")
                .queryParam("words", true)
                .queryParam("word_fields", wordField)
                .queryParam("fields", "text_uthmani,verse_key,chapter_id")
                .queryParam("translations", translationId)
                .buildAndExpand(chapterId)
                .toUriString();

        JsonNode root = client.get(path);
        JsonNode verses = root.path("verses");

        return StreamSupport.stream(verses.spliterator(), false)
                .filter(node -> {
                    int verseNumber = node.path("verse_number").asInt();
                    return verseNumber >= fromVerse && verseNumber <= toVerse;
                })
                .map(node -> new VerseDto(
                        node.path("verse_number").asInt(),
                        node.path("verse_key").asText(),
                        extractArabic(node.path("words"), wordField),
                        extractTranslation(node.path("translations"))
                ))
                .sorted(Comparator.comparing(VerseDto::verseNumber))
                .toList();
    }

    public ChapterAudioDto getChapterAudio(int chapterId, int recitationId) {
        String path = UriComponentsBuilder.fromPath("/chapter_recitations/{recitationId}/{chapterId}")
                .queryParam("segments", true)
                .buildAndExpand(recitationId, chapterId)
                .toUriString();

        JsonNode root = client.get(path);
        JsonNode audioFile = root.path("audio_file");

        List<ChapterAudioTimestampDto> timestamps = StreamSupport.stream(audioFile.path("timestamps").spliterator(), false)
                .map(node -> new ChapterAudioTimestampDto(
                        node.path("verse_key").asText(),
                        parseVerseNumber(node.path("verse_key").asText()),
                        node.path("timestamp_from").asLong(),
                        node.path("timestamp_to").asLong()
                ))
                .sorted(Comparator.comparing(ChapterAudioTimestampDto::verseNumber))
                .toList();

        return new ChapterAudioDto(
                normalizeAudioUrl(audioFile.path("audio_url").asText("")),
                timestamps
        );
    }

    private List<JsonNode> getPaginatedItems(String basePath, String responseField) {
        List<JsonNode> items = new ArrayList<>();
        int page = 1;
        Integer nextPage = 1;

        while (nextPage != null) {
            String path = client.buildPaginatedPath(basePath, page, DEFAULT_PAGE_SIZE);
            JsonNode root = client.get(path);
            JsonNode currentItems = root.path(responseField);
            currentItems.forEach(items::add);

            JsonNode pagination = root.path("pagination");
            nextPage = pagination.path("next_page").isNull() ? null : pagination.path("next_page").asInt();
            page = nextPage == null ? page : nextPage;

            if (pagination.isMissingNode() || pagination.size() == 0) {
                break;
            }
        }

        return items;
    }

    private String extractArabic(JsonNode words, String wordField) {
        StringBuilder builder = new StringBuilder();

        for (JsonNode word : words) {
            String charType = word.path("char_type_name").asText("");
            if (!"word".equalsIgnoreCase(charType)) {
                continue;
            }

            String text = word.path(wordField).asText("").trim();
            if (text.isBlank()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(text);
        }

        return builder.toString();
    }

    private String extractTranslation(JsonNode translations) {
        if (!translations.isArray() || translations.isEmpty()) {
            return "";
        }

        String text = translations.get(0).path("text").asText("");
        return text.replaceAll("<[^>]*>", "").trim();
    }

    private int preferredTranslationRank(Integer id) {
        int preferredIndex = PREFERRED_TRANSLATION_IDS.indexOf(id);
        return preferredIndex >= 0 ? preferredIndex : Integer.MAX_VALUE;
    }

    private String normalizeAudioUrl(String url) {
        if (url == null || url.isBlank()) {
            return "";
        }

        if (url.startsWith("http://") || url.startsWith("https://")) {
            return url;
        }

        return "https://audio.qurancdn.com/" + url;
    }

    private Integer parseVerseNumber(String verseKey) {
        int separatorIndex = verseKey.indexOf(':');
        if (separatorIndex < 0 || separatorIndex >= verseKey.length() - 1) {
            return 0;
        }

        return Integer.parseInt(verseKey.substring(separatorIndex + 1));
    }

    private String resolveWordField(String script) {
        if ("indopak".equalsIgnoreCase(script) || "indo-pak".equalsIgnoreCase(script)) {
            return "text_indopak";
        }

        return "text_uthmani";
    }
}
