package com.app.quranvideogenerator.quran;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;

@Component
public class QuranFoundationClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String apiBaseUrl;

    public QuranFoundationClient(
            ObjectMapper objectMapper,
            @Value("${quran.api.base-url}") String apiBaseUrl
    ) {
        this.restClient = RestClient.builder().build();
        this.objectMapper = objectMapper;
        this.apiBaseUrl = apiBaseUrl;
    }

    public JsonNode get(String pathWithQuery) {
        byte[] response = restClient.get()
                .uri(apiBaseUrl + pathWithQuery)
                .retrieve()
                .body(byte[].class);

        return readTree(response);
    }

    public String buildPaginatedPath(String path, int page, int perPage) {
        return UriComponentsBuilder.fromPath(path)
                .queryParam("page", page)
                .queryParam("per_page", perPage)
                .build()
                .toUriString();
    }

    private JsonNode readTree(byte[] body) {
        try {
            return objectMapper.readTree(body);
        } catch (Exception ex) {
            throw new IllegalStateException(
                    "Failed to parse Quran API response: " + new String(body, StandardCharsets.UTF_8),
                    ex
            );
        }
    }
}
