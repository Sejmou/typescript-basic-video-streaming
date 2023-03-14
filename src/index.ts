import express from 'express';
import { promises as fs } from 'fs';
import { createReadStream, readFileSync } from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();
const port = process.env.PORT || 8000;

const app = express();

const rootDir = path.join(__dirname, '..');
const videoDir = path.join(rootDir, 'videos');

const videoFilenamesSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    filename: z.string().optional(),
  })
);
const videoFilenames = videoFilenamesSchema.parse(
  JSON.parse(readFileSync(path.join(rootDir, 'video-filenames.json'), 'utf-8'))
);
const videoIdToFilename = videoFilenames.reduce((acc, video) => {
  if (video.filename) acc[video.id] = video.filename;
  return acc;
}, {} as Record<string, string>);

app.get('/', function (req, res) {
  res.sendFile(rootDir + '/index.html');
});

app.get('/videos/:id', function (req, res) {
  handleVideoRequest(req, res);
});

app.listen(port, function () {
  console.log(`Listening on port ${port}`);
});

async function handleVideoRequest(req: express.Request, res: express.Response) {
  // Ensure there is a range given for the video
  const range = req.headers.range;
  if (!range) {
    res.status(400).send('Range header required');
    return;
  }
  const videoId = req.params.id;
  if (!videoId) {
    res.status(400).send('Video ID required');
    return;
  }

  const videoFilename = videoIdToFilename[videoId];
  if (!videoFilename) {
    res.status(400).send('Invalid video ID');
    return;
  }

  const videoPath = path.join(videoDir, videoFilename);

  try {
    const videoSize = (await fs.stat(videoPath)).size;

    const CHUNK_SIZE = 10 ** 7; // 1MB
    const start = Number(range.replace(/\D/g, ''));
    const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

    // Create headers
    const contentLength = end - start + 1;
    const headers = {
      'Content-Range': `bytes ${start}-${end}/${videoSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': contentLength,
      'Content-Type': 'video/mp4',
    };

    // HTTP Status 206 for Partial Content
    res.writeHead(206, headers);

    // create video read stream for this particular chunk
    const videoStream = createReadStream(videoPath, { start, end });

    // Stream the video chunk to the client
    videoStream.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal server error');
  }
}
