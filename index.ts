var natural = require("natural");
const getWikipediaData = require("./wikipediaCrawler").getWikipediaData;

interface DocumentI {
  id: number;
  content: string;
}

interface SearchedResault {
  documentId: number;
  score: number;
}

class InformationRetrivalSystem {
  public documents: DocumentI[];
  private invertedIndex: Map<string, Set<number>>;
  private termFreq: Map<number, Map<string, number>>;
  private occurenceMatrix: Map<string, Map<number, number>>;

  constructor(documents: DocumentI[] = []) {
    this.documents = documents;
    this.invertedIndex = new Map();
    this.termFreq = new Map();
    this.occurenceMatrix = new Map();
    this.buildIndex();
  }

  private tokenize(input: string) {
    var tokenizer = new natural.WordTokenizer();
    const regex = /[^\w\s]/g;
    const normInput = input.toLowerCase().replace(regex, "");
    return tokenizer.tokenize(normInput);
  }

  private addDocument(document: DocumentI): void {
    const tokens = this.tokenize(document.content);

    if (!this.termFreq.has(document.id)) {
      this.termFreq.set(document.id, new Map());
    }
    const nestedMap = this.termFreq.get(document.id)!;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Update termFreq
      if (nestedMap.has(token)) {
        nestedMap.set(token, nestedMap.get(token)! + 1);
      } else {
        nestedMap.set(token, 1);
      }

      // Update invertedIndex
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set([document.id]));
      } else {
        const docSet = this.invertedIndex.get(token)!;
        docSet.add(document.id); // Add document ID to the set         // havent sorted it tho !! sorting in intersect method instead
      }

      // Update occurrenceMatrix
      if (!this.occurenceMatrix.has(token)) {
        this.occurenceMatrix.set(token, new Map());
      }
      const termDocMap = this.occurenceMatrix.get(token)!;
      termDocMap.set(document.id, (termDocMap.get(document.id) || 0) + 1);
    }
  }

  private buildIndex() {
    this.documents.forEach((doc) => this.addDocument(doc));
  }

  private booleanSearch() {}

  private intersect(set1: Set<number>, set2: Set<number>): Set<number> {
    const arrSet1 = [...set1].sort((a, b) => a - b);
    const arrSet2 = [...set2].sort((a, b) => a - b);
    let p1: number = 0;
    let p2: number = 0;
    let result: number[] = [];

    while (p1 < arrSet1.length && p2 < arrSet2.length) {
      if (arrSet1[p1] === arrSet2[p2]) {
        result.push(arrSet1[p1]);
        p1++;
        p2++;
      } else if (arrSet1[p1] < arrSet2[p2]) {
        p1++;
      } else {
        p2++;
      }
    }

    return new Set(result);
  }

  private union(set1: Set<number>, set2: Set<number>): Set<number> {
    return new Set([...set1, ...set2]);
  }

  public simpleBooleanSearch(query: string): SearchedResault[] {
    // Tokenize the query and convert to lowercase
    const parts = query.toLowerCase().split(/\s+/);

    let results: Set<number> | null = null;
    let currentOperator: string | null = null;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part === "and" || part === "or" || part === "not") {
        currentOperator = part;
        continue;
      }

      const termDocs = this.invertedIndex.get(part) || new Set<number>();

      if (results === null) {
        results = new Set(termDocs);
        continue;
      }

      if (currentOperator === "and") {
        results = this.intersect(results, termDocs);
      } else if (currentOperator === "or") {
        results = this.union(results, termDocs);
      } else if (currentOperator === "not") {
        for (const docId of termDocs) {
          results.delete(docId);
        }
      }
    }

    const finalResults = results ? Array.from(results) : [];
    return finalResults.map((docId) => ({
      documentId: docId,
      score: 1.0,
    }));
  }

  //   Create a printInvertedIndex method to display the current index state
  // Create a printOccurrenceMatrix method to display the term-document matrix

  // Calculate IDF for a term
  private calculateIDF(term: string): number {
    const docsWithTerm = this.invertedIndex.get(term)?.size || 0;
    if (docsWithTerm === 0) return 0;

    return Math.log10(this.documents.length / docsWithTerm);
  }

  private calculateTFIDF(term: string, docId: number): number {
    // Get term frequency in document
    const tf = this.termFreq.get(docId)?.get(term) || 0;
    if (tf === 0) return 0;

    // Use log normalization for term frequency: 1 + log(tf)
    const normalizedTF = 1 + Math.log10(tf);

    const idf = this.calculateIDF(term);

    return normalizedTF * idf;
  }

  private getDocumentVectorLength(docId: number): number {
    let sumSquared = 0;
    const termFreqs = this.termFreq.get(docId);

    if (!termFreqs) return 0;

    for (const [term, _] of termFreqs) {
      const weight = this.calculateTFIDF(term, docId);
      sumSquared += weight * weight;
    }

    return Math.sqrt(sumSquared);
  }

  public tfidfSearch(query: string, topK: number = 10): SearchedResault[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const queryTermFreq = new Map<string, number>();
    queryTerms.forEach((term: string) => {
      queryTermFreq.set(term, (queryTermFreq.get(term) || 0) + 1);
    });

    let queryVectorLength = 0;
    for (const [term, freq] of queryTermFreq) {
      const normalizedTF = freq > 0 ? 1 + Math.log10(freq) : 0;
      const idf = this.calculateIDF(term);
      const weight = normalizedTF * idf;
      queryVectorLength += weight * weight;
    }
    queryVectorLength = Math.sqrt(queryVectorLength);

    if (queryVectorLength === 0) return [];

    const scores = new Map<number, number>();

    for (const doc of this.documents) {
      let dotProduct = 0;

      for (const [term, queryFreq] of queryTermFreq) {
        const queryTF = 1 + Math.log10(queryFreq);
        const queryWeight = queryTF * this.calculateIDF(term);

        const docWeight = this.calculateTFIDF(term, doc.id);

        dotProduct += queryWeight * docWeight;
      }

      const docVectorLength = this.getDocumentVectorLength(doc.id);

      if (docVectorLength === 0) continue;

      const similarity = dotProduct / (queryVectorLength * docVectorLength);

      if (similarity > 0) {
        scores.set(doc.id, similarity);
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([documentId, score]) => ({ documentId, score }));
  }

  public printOccurrenceMatrix(): void {
    // Get all document IDs
    const docIds = this.documents.map((doc) => doc.id).sort((a, b) => a - b);

    // Print header row with document IDs
    let header = "Term";
    docIds.forEach((docId) => {
      header += `\t| Doc ${docId}`;
    });
    console.log(header);
    console.log("-".repeat(header.length));

    // Print each term and its occurrences in documents
    for (const [term, docMap] of this.occurenceMatrix) {
      let row = term;

      docIds.forEach((docId) => {
        const count = docMap.get(docId) || 0;
        row += `\t| ${count}`;
      });

      console.log(row);
    }
  }

  public printInvertedIndex(): void {
    console.log("Inverted Index:");
    console.log("--------------");

    // Sort terms alphabetically for better readability
    const sortedTerms = Array.from(this.invertedIndex.keys()).sort();

    for (const term of sortedTerms) {
      const docIds = Array.from(this.invertedIndex.get(term) || []).sort(
        (a, b) => a - b
      );
      console.log(`${term}: [${docIds.join(", ")}]`);
    }
  }
}

async function main() {
  const topics = [
    "Information_retrieval",
    "Machine_learning",
    "Natural_language_processing",
    "Data_mining",
    "Search_engine",
  ];

  console.log("Starting to crawl Wikipedia...");
  const documents = await getWikipediaData(topics);
  console.log(`Loaded ${documents.length} documents from Wikipedia`);

  const irSystem = new InformationRetrivalSystem(documents);

  console.log('\nSearch for "information retrieval":');
  const results1 = irSystem.simpleBooleanSearch("information AND retrieval");
  console.log(results1);

  console.log('\nSearch for "learning OR processing":');
  const results2 = irSystem.simpleBooleanSearch("learning OR processing");
  console.log(results2);

  console.log('\nTF-IDF Search for "information retrieval":');
  const tfidfResults1 = irSystem.tfidfSearch("information retrieval");
  console.log(tfidfResults1);

  console.log('\nTF-IDF Search for "learning processing":');
  const tfidfResults2 = irSystem.tfidfSearch("learning processing");
  console.log(tfidfResults2);

  //   console.log("\nPrinting Occurrence Matrix:");
  //   irSystem.printOccurrenceMatrix();

  //   console.log("\nPrinting Inverted Index:");
  //   irSystem.printInvertedIndex();
}

main().catch(console.error);
