import type { AgentId, UserId } from "@/domain/ids";
import type { ExperimentStatus, ResearchThesis, StrategyExperiment, StrategyProposal } from "@/research/types";

export interface ResearchStore {
  saveThesis(thesis: ResearchThesis): void;
  getThesis(userId: UserId, thesisId: string): ResearchThesis | null;
  listTheses(userId: UserId): readonly ResearchThesis[];
  saveProposal(proposal: StrategyProposal): void;
  getProposal(userId: UserId, proposalId: string): StrategyProposal | null;
  saveExperiment(experiment: StrategyExperiment): void;
  getExperiment(userId: UserId, experimentId: string): StrategyExperiment | null;
  listExperiments(userId: UserId): readonly StrategyExperiment[];
  updateExperimentStatus(userId: UserId, experimentId: string, status: ExperimentStatus, reason: string | null): void;
}

export interface ResearchMemory {
  theses: ResearchThesis[];
  proposals: StrategyProposal[];
  experiments: StrategyExperiment[];
}

type Memory = ResearchMemory;

export class InMemoryResearchStore implements ResearchStore {
  private readonly books = new Map<string, Memory>();

  saveThesis(thesis: ResearchThesis): void {
    const book = this.book(thesis.userId, thesis.agentId);
    const index = book.theses.findIndex((item) => item.thesisId === thesis.thesisId);
    if (index >= 0) {
      book.theses[index] = thesis;
      return;
    }
    book.theses.push(thesis);
  }

  getThesis(userId: UserId, thesisId: string): ResearchThesis | null {
    for (const book of this.booksFor(userId)) {
      const thesis = book.theses.find((item) => item.thesisId === thesisId && item.userId === userId);
      if (thesis) {
        return thesis;
      }
    }
    return null;
  }

  listTheses(userId: UserId): readonly ResearchThesis[] {
    return this.booksFor(userId).flatMap((book) => book.theses.filter((item) => item.userId === userId));
  }

  saveProposal(proposal: StrategyProposal): void {
    const book = this.book(proposal.userId, proposal.agentId);
    const index = book.proposals.findIndex((item) => item.proposalId === proposal.proposalId);
    if (index >= 0) {
      book.proposals[index] = proposal;
      return;
    }
    book.proposals.push(proposal);
  }

  getProposal(userId: UserId, proposalId: string): StrategyProposal | null {
    for (const book of this.booksFor(userId)) {
      const proposal = book.proposals.find((item) => item.proposalId === proposalId && item.userId === userId);
      if (proposal) {
        return proposal;
      }
    }
    return null;
  }

  saveExperiment(experiment: StrategyExperiment): void {
    const book = this.book(experiment.userId, experiment.agentId);
    const index = book.experiments.findIndex((item) => item.experimentId === experiment.experimentId);
    if (index >= 0) {
      book.experiments[index] = experiment;
      return;
    }
    book.experiments.push(experiment);
  }

  getExperiment(userId: UserId, experimentId: string): StrategyExperiment | null {
    for (const book of this.booksFor(userId)) {
      const experiment = book.experiments.find((item) => item.experimentId === experimentId && item.userId === userId);
      if (experiment) {
        return experiment;
      }
    }
    return null;
  }

  listExperiments(userId: UserId): readonly StrategyExperiment[] {
    return this.booksFor(userId).flatMap((book) => book.experiments.filter((item) => item.userId === userId));
  }

  updateExperimentStatus(userId: UserId, experimentId: string, status: ExperimentStatus, reason: string | null): void {
    const experiment = this.getExperiment(userId, experimentId);
    if (!experiment || experiment.userId !== userId) {
      return;
    }
    this.saveExperiment({ ...experiment, status, reason });
  }

  exportBook(userId: UserId, agentId: AgentId): Memory {
    const book = this.books.get(`${userId}\n${agentId}`);
    return {
      theses: [...(book?.theses ?? [])],
      proposals: [...(book?.proposals ?? [])],
      experiments: [...(book?.experiments ?? [])],
    };
  }

  replaceBook(userId: UserId, agentId: AgentId, book: Memory): void {
    this.books.set(`${userId}\n${agentId}`, {
      theses: [...book.theses],
      proposals: [...book.proposals],
      experiments: [...book.experiments],
    });
  }

  private book(userId: UserId, agentId: AgentId): Memory {
    const key = `${userId}\n${agentId}`;
    const existing = this.books.get(key);
    if (existing) {
      return existing;
    }
    const created: Memory = { theses: [], proposals: [], experiments: [] };
    this.books.set(key, created);
    return created;
  }

  private booksFor(userId: UserId): Memory[] {
    const matches: Memory[] = [];
    for (const [key, book] of this.books) {
      if (key.startsWith(`${userId}\n`)) {
        matches.push(book);
      }
    }
    return matches;
  }
}

const STORE_KEY = "__kairosResearchStore";

type StoreHost = typeof globalThis & { [STORE_KEY]?: InMemoryResearchStore };

/** Shared across the page bundle and the research route. A module local would split them. */
function storeHost(): StoreHost {
  return globalThis as StoreHost;
}

export function researchStore(): ResearchStore {
  const host = storeHost();
  host[STORE_KEY] ??= new InMemoryResearchStore();
  return host[STORE_KEY];
}

export function resetResearchStore(): void {
  storeHost()[STORE_KEY] = new InMemoryResearchStore();
}

export function exportResearchBook(userId: UserId, agentId: AgentId): Memory {
  return liveStore().exportBook(userId, agentId);
}

export function importResearchBook(userId: UserId, agentId: AgentId, book: Memory): void {
  liveStore().replaceBook(userId, agentId, book);
}

function liveStore(): InMemoryResearchStore {
  const store = researchStore();
  if (!(store instanceof InMemoryResearchStore)) {
    throw new Error("STATE_INVALID");
  }
  return store;
}
