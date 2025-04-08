import axios from "axios";
import * as cheerio from "cheerio";

interface WikiArticle {
  title: string;
  content: string;
}

async function fetchWikipediaArticle(
  topic: string
): Promise<WikiArticle | null> {
  try {
    const formattedTopic = topic.replace(/\s+/g, "_");
    const url = `https://en.wikipedia.org/wiki/${formattedTopic}`;

    const response = await axios.get(url);

    const $ = cheerio.load(response.data);

    const title = $("#firstHeading").text().trim();

    let content = "";
    $("#mw-content-text p").each((_, element) => {
      content += $(element).text() + " ";
    });

    content = content.replace(/\[\d+\]/g, "");
    content = content.replace(/\s+/g, " ").trim();

    return { title, content };
  } catch (error) {
    console.error(`Error fetching article for "${topic}": ${error}`);
    return null;
  }
}

async function crawlWikipedia(topics: string[]): Promise<WikiArticle[]> {
  const articles: WikiArticle[] = [];

  for (const topic of topics) {
    console.log(`Fetching article for "${topic}"...`);

    const article = await fetchWikipediaArticle(topic);
    if (article) {
      articles.push(article);
      console.log(`Successfully fetched "${article.title}"`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return articles;
}

function convertToDocuments(articles: WikiArticle[]): any[] {
  return articles.map((article, index) => ({
    id: index + 1,
    content: `${article.title}. ${article.content}`,
  }));
}

export async function getWikipediaData(topics: string[]): Promise<any[]> {
  try {
    const articles = await crawlWikipedia(topics);
    console.log(`Successfully crawled ${articles.length} articles.`);

    const documents = convertToDocuments(articles);
    return documents;
  } catch (error) {
    console.error("Error in crawler:", error);
    return [];
  }
}
