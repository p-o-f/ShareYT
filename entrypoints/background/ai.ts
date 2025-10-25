import { getGenerativeModel } from 'firebase/ai';

const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash-lite' });

export async function summarizeVideo(videoUrl: string) {
  const prompt =
    'Summarize the following video and also output its title: ' + videoUrl;

  const result = await model.generateContent(prompt);

  const response = result.response;
  const text = response.text();
  console.log(text);
  return text;
}
