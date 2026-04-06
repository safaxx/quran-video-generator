package com.app.quranvideogenerator.quran;

import com.app.quranvideogenerator.quran.dto.ChapterAudioDto;
import com.app.quranvideogenerator.quran.dto.ChapterAudioTimestampDto;
import com.app.quranvideogenerator.quran.dto.ChapterOption;
import com.app.quranvideogenerator.quran.dto.VerseDto;
import com.app.quranvideogenerator.quran.dto.VideoRenderRequest;
import org.bytedeco.ffmpeg.global.avcodec;
import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacv.FFmpegFrameGrabber;
import org.bytedeco.javacv.FFmpegFrameRecorder;
import org.bytedeco.javacv.Frame;
import org.bytedeco.javacv.Java2DFrameConverter;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageInputStream;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextAttribute;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Base64;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.AttributedCharacterIterator;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class VideoRenderService {

    private static final int VIDEO_WIDTH = 960;
    private static final int VIDEO_HEIGHT = 540;
    private static final int VIDEO_FPS = 24;
    private static final long MICROS_PER_SECOND = 1_000_000L;
    private static final long MICROS_PER_MILLISECOND = 1_000L;
    private static final Color TITLE_COLOR = new Color(255, 242, 214);
    private static final Color TRANSLATION_COLOR = new Color(237, 244, 241);
    private static final Color PROGRESS_FILL = new Color(244, 201, 126);
    private static final Color PROGRESS_TRACK = new Color(255, 255, 255, 52);
    private static final Color TIMECODE_COLOR = new Color(245, 250, 248, 214);

    private final QuranDataService quranDataService;
    private final QuranFoundationClient quranFoundationClient;

    public VideoRenderService(QuranDataService quranDataService, QuranFoundationClient quranFoundationClient) {
        this.quranDataService = quranDataService;
        this.quranFoundationClient = quranFoundationClient;
    }

    public byte[] render(VideoRenderRequest request) {
        validate(request);

        ChapterOption chapter = quranDataService.getChapters().stream()
                .filter(item -> item.id() == request.chapterId())
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Selected surah was not found."));

        List<VerseDto> verses = quranDataService.getVerses(
                request.chapterId(),
                request.fromVerse(),
                request.toVerse(),
                request.translationId(),
                request.script()
        );
        if (verses.isEmpty()) {
            throw new IllegalArgumentException("No verses were found for the selected range.");
        }

        ChapterAudioDto chapterAudio = quranDataService.getChapterAudio(request.chapterId(), request.recitationId());
        if (chapterAudio.audioUrl() == null || chapterAudio.audioUrl().isBlank()) {
            throw new IllegalArgumentException("The selected recitation does not have a chapter audio file.");
        }

        List<ChapterAudioTimestampDto> rangeTimestamps = chapterAudio.timestamps().stream()
                .filter(timestamp -> timestamp.verseNumber() >= request.fromVerse() && timestamp.verseNumber() <= request.toVerse())
                .sorted(Comparator.comparing(ChapterAudioTimestampDto::verseNumber))
                .toList();
        if (rangeTimestamps.isEmpty()) {
            throw new IllegalArgumentException("The selected verse range does not have audio timing data.");
        }

        long startMicros = rangeTimestamps.getFirst().timestampFrom() * MICROS_PER_MILLISECOND;
        long endMicros = rangeTimestamps.getLast().timestampTo() * MICROS_PER_MILLISECOND;
        long durationMicros = Math.max(endMicros - startMicros, MICROS_PER_SECOND / 2);

        Path outputPath = null;
        AtomicReference<Path> audioPathRef = new AtomicReference<>();
        AtomicReference<Path> backgroundVideoPathRef = new AtomicReference<>();

        try (Java2DFrameConverter converter = new Java2DFrameConverter();
             FFmpegFrameGrabber audioGrabber = new FFmpegFrameGrabber(resolveAudioPath(chapterAudio.audioUrl(), audioPathRef::set));
             BackgroundSource backgroundSource = createBackgroundSource(
                     request.backgroundType(),
                     request.backgroundMimeType(),
                     request.backgroundDataUrl(),
                     request.backgroundUrl(),
                     backgroundVideoPathRef
             )) {

            outputPath = Files.createTempFile("quran-video-export-", ".mp4");
            audioGrabber.start();

            int audioChannels = Math.max(audioGrabber.getAudioChannels(), 2);
            int sampleRate = Math.max(audioGrabber.getSampleRate(), 44_100);

            try (FFmpegFrameRecorder recorder = new FFmpegFrameRecorder(outputPath.toFile(), VIDEO_WIDTH, VIDEO_HEIGHT, audioChannels)) {
                recorder.setFormat("mp4");
                recorder.setFrameRate(VIDEO_FPS);
                recorder.setVideoCodec(avcodec.AV_CODEC_ID_H264);
                recorder.setPixelFormat(avutil.AV_PIX_FMT_YUV420P);
                recorder.setVideoBitrate(1_600_000);
                recorder.setAudioCodec(avcodec.AV_CODEC_ID_AAC);
                recorder.setSampleRate(sampleRate);
                recorder.setAudioChannels(audioChannels);
                recorder.setAudioBitrate(192_000);
                recorder.start();

                renderAudioAndVideo(
                        request,
                        chapter,
                        verses,
                        rangeTimestamps,
                        backgroundSource,
                        startMicros,
                        endMicros,
                        durationMicros,
                        audioGrabber,
                        recorder,
                        converter
                );

                recorder.stop();
            }

            audioGrabber.stop();
            return Files.readAllBytes(outputPath);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to render MP4 video.", ex);
        } finally {
            if (audioPathRef.get() != null) {
                try {
                    Files.deleteIfExists(audioPathRef.get());
                } catch (IOException ignored) {
                }
            }
            if (backgroundVideoPathRef.get() != null) {
                try {
                    Files.deleteIfExists(backgroundVideoPathRef.get());
                } catch (IOException ignored) {
                }
            }
            if (outputPath != null) {
                try {
                    Files.deleteIfExists(outputPath);
                } catch (IOException ignored) {
                }
            }
        }
    }

    private void renderAudioAndVideo(
            VideoRenderRequest request,
            ChapterOption chapter,
            List<VerseDto> verses,
            List<ChapterAudioTimestampDto> rangeTimestamps,
            BackgroundSource backgroundSource,
            long startMicros,
            long endMicros,
            long durationMicros,
            FFmpegFrameGrabber audioGrabber,
            FFmpegFrameRecorder recorder,
            Java2DFrameConverter converter
    ) throws Exception {
        long frameDurationMicros = MICROS_PER_SECOND / VIDEO_FPS;
        long nextVideoMicros = 0L;

        audioGrabber.setTimestamp(startMicros);
        Frame audioFrame;

        while ((audioFrame = audioGrabber.grabSamples()) != null) {
            long sourceTimestamp = audioGrabber.getTimestamp();
            if (sourceTimestamp < startMicros) {
                continue;
            }
            if (sourceTimestamp > endMicros) {
                break;
            }

            long relativeMicros = Math.max(sourceTimestamp - startMicros, 0L);
            while (nextVideoMicros <= relativeMicros && nextVideoMicros <= durationMicros) {
                recorder.setTimestamp(nextVideoMicros);
                BufferedImage frameImage = renderFrame(
                        request,
                        chapter,
                        verses,
                        rangeTimestamps,
                        backgroundSource,
                        nextVideoMicros,
                        durationMicros
                );
                recorder.record(converter.convert(frameImage));
                nextVideoMicros += frameDurationMicros;
            }

            recorder.setTimestamp(relativeMicros);
            recorder.record(audioFrame);
        }

        while (nextVideoMicros <= durationMicros) {
            recorder.setTimestamp(nextVideoMicros);
            BufferedImage frameImage = renderFrame(
                    request,
                    chapter,
                    verses,
                    rangeTimestamps,
                    backgroundSource,
                    nextVideoMicros,
                    durationMicros
            );
            recorder.record(converter.convert(frameImage));
            nextVideoMicros += frameDurationMicros;
        }
    }

    private BufferedImage renderFrame(
            VideoRenderRequest request,
            ChapterOption chapter,
            List<VerseDto> verses,
            List<ChapterAudioTimestampDto> rangeTimestamps,
            BackgroundSource backgroundSource,
            long elapsedMicros,
            long durationMicros
    ) {
        BufferedImage frame = new BufferedImage(VIDEO_WIDTH, VIDEO_HEIGHT, BufferedImage.TYPE_3BYTE_BGR);
        Graphics2D graphics = frame.createGraphics();

        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

            drawBackground(graphics, backgroundSource.frameAt(elapsedMicros));

            GradientPaint overlay = new GradientPaint(
                    0,
                    0,
                    new Color(7, 16, 21, 89),
                    0,
                    VIDEO_HEIGHT,
                    new Color(7, 16, 21, 184)
            );
            graphics.setPaint(overlay);
            graphics.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

            VerseDto activeVerse = determineVerse(verses, rangeTimestamps, elapsedMicros);
            drawVerseCard(graphics, request, chapter, activeVerse);
        } finally {
            graphics.dispose();
        }

        return frame;
    }

    private void drawBackground(Graphics2D graphics, BufferedImage background) {
        double scale = Math.max((double) VIDEO_WIDTH / background.getWidth(), (double) VIDEO_HEIGHT / background.getHeight());
        int drawWidth = (int) Math.round(background.getWidth() * scale);
        int drawHeight = (int) Math.round(background.getHeight() * scale);
        int drawX = (VIDEO_WIDTH - drawWidth) / 2;
        int drawY = (VIDEO_HEIGHT - drawHeight) / 2;
        graphics.drawImage(background, drawX, drawY, drawWidth, drawHeight, null);
    }

    private void drawVerseCard(Graphics2D graphics, VideoRenderRequest request, ChapterOption chapter, VerseDto verse) {
        int cardWidth = 850;
        int cardX = 55;
        int cardY = 185;
        int cardHeight = 170;
        int radius = 20;

        graphics.setComposite(AlphaComposite.SrcOver);
        graphics.setColor(new Color(7, 18, 24, clamp(request.contentOpacity(), 0, 90) * 255 / 100));
        graphics.fill(new RoundRectangle2D.Float(cardX, cardY, cardWidth, cardHeight, radius, radius));

        graphics.setColor(TITLE_COLOR);
        Font titleFont = chooseArabicFont(28f);
        graphics.setFont(titleFont);
        drawCenteredText(graphics, chapter.nameArabic(), cardX + cardWidth / 2, cardY + 46);

        Font arabicFont = chooseArabicFont(clamp(request.verseFontSize(), 28, 72));
        graphics.setFont(arabicFont);
        graphics.setColor(Color.WHITE);
        int arabicTop = cardY + 58;
        drawWrappedText(graphics, verse.arabic(), cardX + 36, arabicTop, cardWidth - 72, true, true);

        graphics.setFont(new Font("SansSerif", Font.PLAIN, 18));
        graphics.setColor(TRANSLATION_COLOR);
        int translationTop = cardY + 116;
        drawWrappedText(graphics, verse.translation(), cardX + 42, translationTop, cardWidth - 84, false, true);
    }

    private VerseDto determineVerse(List<VerseDto> verses, List<ChapterAudioTimestampDto> timestamps, long elapsedMicros) {
        long elapsedMillis = elapsedMicros / MICROS_PER_MILLISECOND;
        Integer verseNumber = timestamps.stream()
                .filter(timestamp -> elapsedMillis >= (timestamp.timestampFrom() - timestamps.getFirst().timestampFrom())
                        && elapsedMillis < (timestamp.timestampTo() - timestamps.getFirst().timestampFrom()))
                .map(ChapterAudioTimestampDto::verseNumber)
                .findFirst()
                .orElse(timestamps.getLast().verseNumber());

        return verses.stream()
                .filter(verse -> verse.verseNumber() == verseNumber)
                .findFirst()
                .orElse(verses.getLast());
    }

    private void drawCenteredText(Graphics2D graphics, String text, int centerX, int baselineY) {
        FontMetrics metrics = graphics.getFontMetrics();
        int textWidth = metrics.stringWidth(text);
        graphics.drawString(text, centerX - textWidth / 2, baselineY);
    }

    private void drawWrappedText(
            Graphics2D graphics,
            String text,
            int x,
            int topY,
            int maxWidth,
            boolean rtl,
            boolean center
    ) {
        Map<AttributedCharacterIterator.Attribute, Object> attributes = new java.util.HashMap<>();
        attributes.put(TextAttribute.FONT, graphics.getFont());
        attributes.put(TextAttribute.RUN_DIRECTION, rtl ? TextAttribute.RUN_DIRECTION_RTL : TextAttribute.RUN_DIRECTION_LTR);
        AttributedString attributed = new AttributedString(text, attributes);
        AttributedCharacterIterator iterator = attributed.getIterator();
        LineBreakMeasurer measurer = new LineBreakMeasurer(iterator, new FontRenderContext(null, true, true));
        List<String> lines = new ArrayList<>();

        while (measurer.getPosition() < iterator.getEndIndex()) {
            int start = measurer.getPosition();
            measurer.nextLayout(maxWidth);
            int end = measurer.getPosition();
            lines.add(text.substring(start, end).trim());
        }

        FontMetrics metrics = graphics.getFontMetrics();
        int lineHeight = metrics.getHeight() + 6;
        int baseline = topY + metrics.getAscent();

        for (String line : lines) {
            int drawX = x;
            if (center) {
                drawX = x + (maxWidth - metrics.stringWidth(line)) / 2;
            }
            graphics.drawString(line, drawX, baseline);
            baseline += lineHeight;
        }
    }

    private BufferedImage loadBackground(String backgroundDataUrl, String backgroundUrl) {
        if (backgroundDataUrl != null && backgroundDataUrl.startsWith("data:image/")) {
            int commaIndex = backgroundDataUrl.indexOf(',');
            if (commaIndex > 0) {
                try {
                    byte[] imageBytes = Base64.getDecoder().decode(backgroundDataUrl.substring(commaIndex + 1));
                    BufferedImage image = ImageIO.read(new ByteArrayInputStream(imageBytes));
                    if (image != null) {
                        return image;
                    }
                } catch (IOException | IllegalArgumentException ignored) {
                }
            }
        }

        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(quranFoundationClient.downloadBytes(backgroundUrl)));
            if (image == null) {
                throw new IllegalArgumentException("The selected background could not be loaded.");
            }
            return image;
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to load the selected background.", ex);
        }
    }

    private String resolveAudioPath(String audioUrl, java.util.function.Consumer<Path> tempPathConsumer) {
        try {
            byte[] audioBytes = quranFoundationClient.downloadBytes(audioUrl);
            Path tempAudio = Files.createTempFile("quran-recitation-", ".mp3");
            Files.write(tempAudio, audioBytes);
            tempPathConsumer.accept(tempAudio);
            return tempAudio.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to download the selected recitation audio.", ex);
        }
    }

    private Font chooseArabicFont(float size) {
        return new Font("Serif", Font.PLAIN, Math.round(size)).deriveFont(size);
    }

    private BackgroundSource createBackgroundSource(
            String backgroundType,
            String backgroundMimeType,
            String backgroundDataUrl,
            String backgroundUrl,
            AtomicReference<Path> backgroundVideoPathRef
    ) {
        if ("video".equalsIgnoreCase(backgroundType)) {
            return createVideoBackgroundSource(backgroundDataUrl, backgroundUrl, backgroundVideoPathRef);
        }

        if (isGifBackground(backgroundMimeType, backgroundDataUrl, backgroundUrl)) {
            return createGifBackgroundSource(backgroundDataUrl, backgroundUrl);
        }

        BufferedImage image = loadBackground(backgroundDataUrl, backgroundUrl);
        return new ImageBackgroundSource(image);
    }

    private BackgroundSource createVideoBackgroundSource(
            String backgroundDataUrl,
            String backgroundUrl,
            AtomicReference<Path> backgroundVideoPathRef
    ) {
        try {
            byte[] videoBytes = resolveBackgroundVideoBytes(backgroundDataUrl, backgroundUrl);
            Path tempVideo = Files.createTempFile("quran-background-", resolveVideoExtension(backgroundDataUrl, backgroundUrl));
            Files.write(tempVideo, videoBytes);
            backgroundVideoPathRef.set(tempVideo);

            FFmpegFrameGrabber grabber = new FFmpegFrameGrabber(tempVideo.toFile());
            grabber.start();
            return new VideoBackgroundSource(grabber);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to load the selected video background.", ex);
        }
    }

    private byte[] resolveBackgroundVideoBytes(String backgroundDataUrl, String backgroundUrl) {
        if (backgroundDataUrl != null && backgroundDataUrl.startsWith("data:video/")) {
            int commaIndex = backgroundDataUrl.indexOf(',');
            if (commaIndex > 0) {
                return Base64.getDecoder().decode(backgroundDataUrl.substring(commaIndex + 1));
            }
        }

        return quranFoundationClient.downloadBytes(backgroundUrl);
    }

    private boolean isGifBackground(String backgroundMimeType, String backgroundDataUrl, String backgroundUrl) {
        if (backgroundMimeType != null && backgroundMimeType.equalsIgnoreCase("image/gif")) {
            return true;
        }
        if (backgroundDataUrl != null && backgroundDataUrl.startsWith("data:image/gif")) {
            return true;
        }
        return backgroundUrl != null && backgroundUrl.toLowerCase().contains(".gif");
    }

    private BackgroundSource createGifBackgroundSource(String backgroundDataUrl, String backgroundUrl) {
        try {
            byte[] gifBytes = resolveImageBytes(backgroundDataUrl, backgroundUrl);
            return new GifBackgroundSource(gifBytes);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to load the selected GIF background.", ex);
        }
    }

    private byte[] resolveImageBytes(String backgroundDataUrl, String backgroundUrl) {
        if (backgroundDataUrl != null && backgroundDataUrl.startsWith("data:image/")) {
            int commaIndex = backgroundDataUrl.indexOf(',');
            if (commaIndex > 0) {
                return Base64.getDecoder().decode(backgroundDataUrl.substring(commaIndex + 1));
            }
        }

        return quranFoundationClient.downloadBytes(backgroundUrl);
    }

    private String resolveVideoExtension(String backgroundDataUrl, String backgroundUrl) {
        if (backgroundDataUrl != null && backgroundDataUrl.startsWith("data:video/")) {
            if (backgroundDataUrl.startsWith("data:video/webm")) {
                return ".webm";
            }
            if (backgroundDataUrl.startsWith("data:video/ogg")) {
                return ".ogv";
            }
            if (backgroundDataUrl.startsWith("data:video/quicktime")) {
                return ".mov";
            }
        }

        String normalizedUrl = backgroundUrl == null ? "" : backgroundUrl.toLowerCase();
        if (normalizedUrl.contains(".webm")) {
          return ".webm";
        }
        if (normalizedUrl.contains(".mov")) {
          return ".mov";
        }
        return ".mp4";
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private void validate(VideoRenderRequest request) {
        if (request.chapterId() <= 0) {
            throw new IllegalArgumentException("A surah must be selected before export.");
        }
        if (request.fromVerse() <= 0 || request.toVerse() < request.fromVerse()) {
            throw new IllegalArgumentException("The verse range is invalid.");
        }
        if (request.translationId() <= 0 || request.recitationId() <= 0) {
            throw new IllegalArgumentException("Translation and reciter are required for export.");
        }
        if ((request.backgroundUrl() == null || request.backgroundUrl().isBlank())
                && (request.backgroundDataUrl() == null || request.backgroundDataUrl().isBlank())) {
            throw new IllegalArgumentException("A background must be selected before export.");
        }
    }

    private interface BackgroundSource extends AutoCloseable {
        BufferedImage frameAt(long elapsedMicros);

        @Override
        default void close() throws Exception {
        }
    }

    private static final class ImageBackgroundSource implements BackgroundSource {
        private final BufferedImage image;

        private ImageBackgroundSource(BufferedImage image) {
            this.image = image;
        }

        @Override
        public BufferedImage frameAt(long elapsedMicros) {
            return image;
        }
    }

    private static final class GifBackgroundSource implements BackgroundSource {
        private final List<BufferedImage> frames;
        private final List<Long> cumulativeDurationsMicros;
        private final long totalDurationMicros;

        private GifBackgroundSource(byte[] gifBytes) {
            this.frames = new ArrayList<>();
            this.cumulativeDurationsMicros = new ArrayList<>();

            try (ImageInputStream imageInputStream = ImageIO.createImageInputStream(new ByteArrayInputStream(gifBytes))) {
                Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName("gif");
                if (!readers.hasNext()) {
                    throw new IllegalStateException("GIF reader is not available.");
                }

                ImageReader reader = readers.next();
                reader.setInput(imageInputStream, false);

                long totalMicros = 0L;
                int frameCount = reader.getNumImages(true);
                for (int index = 0; index < frameCount; index++) {
                    BufferedImage frame = reader.read(index);
                    frames.add(frame);

                    long frameDelayMicros = extractGifDelayMicros(reader.getImageMetadata(index));
                    totalMicros += frameDelayMicros;
                    cumulativeDurationsMicros.add(totalMicros);
                }

                reader.dispose();
                this.totalDurationMicros = Math.max(totalMicros, MICROS_PER_SECOND / 5);
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to decode GIF background.", ex);
            }
        }

        @Override
        public BufferedImage frameAt(long elapsedMicros) {
            if (frames.isEmpty()) {
                throw new IllegalStateException("GIF background has no frames.");
            }

            long loopedMicros = elapsedMicros % totalDurationMicros;
            for (int index = 0; index < cumulativeDurationsMicros.size(); index++) {
                if (loopedMicros < cumulativeDurationsMicros.get(index)) {
                    return frames.get(index);
                }
            }

            return frames.getLast();
        }

        private long extractGifDelayMicros(javax.imageio.metadata.IIOMetadata metadata) {
            String formatName = metadata.getNativeMetadataFormatName();
            if (formatName == null) {
                return 100_000L;
            }

            IIOMetadataNode root = (IIOMetadataNode) metadata.getAsTree(formatName);
            IIOMetadataNode graphicsControlExtension =
                    (IIOMetadataNode) root.getElementsByTagName("GraphicControlExtension").item(0);
            if (graphicsControlExtension == null) {
                return 100_000L;
            }

            String delayTime = graphicsControlExtension.getAttribute("delayTime");
            try {
                int hundredths = Integer.parseInt(delayTime);
                return Math.max(hundredths * 10_000L, 100_000L);
            } catch (NumberFormatException ex) {
                return 100_000L;
            }
        }
    }

    private static final class VideoBackgroundSource implements BackgroundSource {
        private final FFmpegFrameGrabber grabber;
        private final Java2DFrameConverter converter;
        private final long durationMicros;

        private VideoBackgroundSource(FFmpegFrameGrabber grabber) {
            this.grabber = grabber;
            this.converter = new Java2DFrameConverter();
            this.durationMicros = Math.max(grabber.getLengthInTime(), MICROS_PER_SECOND);
        }

        @Override
        public BufferedImage frameAt(long elapsedMicros) {
            long loopedTimestamp = elapsedMicros % durationMicros;
            try {
                grabber.setTimestamp(loopedTimestamp);
                Frame frame = grabber.grabImage();
                BufferedImage image = frame == null ? null : converter.convert(frame);
                if (image == null) {
                    throw new IllegalStateException("Could not decode the selected video background.");
                }
                return image;
            } catch (Exception ex) {
                throw new IllegalStateException("Failed while reading the selected video background.", ex);
            }
        }

        @Override
        public void close() throws Exception {
            grabber.stop();
            grabber.close();
            converter.close();
        }
    }
}
