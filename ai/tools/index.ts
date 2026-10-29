import type { UIMessage, UIMessageStreamWriter } from "ai";
import type { DataPart } from "@/ai/message/data-part";
import type { InferUITools } from "ai";
import type { RequestTraceLogger } from "@/lib/request-trace-logger.server";
import type { BuildSession } from "@/ai/build-session";

import { applyChanges } from "./apply-changes";
import { chooseInspiration } from "./choose-inspiration";
import { exploreProject } from "./explore-project";
import { finishBuild } from "./finish-build";
import { generateAsset } from "./generate-asset";
import { listFiles } from "./list-files";
import { readProjectFiles } from "./read-project-files";
import { requestUserInput } from "./request-user-input";
import { runCommand } from "./run-command";
import { searchCode } from "./search-code";
import { submitDesignBrief } from "./design-brief";
import { submitDesignStudy } from "./design-study";
import { webScrape } from "./web-scrape";
import { webSearch } from "@exalabs/ai-sdk";

export interface ToolParams {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>;
  projectId: string;
  mode: "BUILD" | "PLAN";
  signal: AbortSignal;
  logger: RequestTraceLogger;
  session: BuildSession;
}

export function tools(ctx: ToolParams) {
  return {
    exploreProject: exploreProject(ctx),
    generateAsset: generateAsset(ctx),
    listFiles: listFiles(ctx),
    searchCode: searchCode(ctx),
    readFiles: readProjectFiles(ctx),
    requestUserInput: requestUserInput(),
    webSearch: webSearch({
      apiKey: process.env.EXA_API_KEY,
      contents: {
        text: true,
      },
    }),
    applyChanges: applyChanges(ctx),
    chooseInspiration: chooseInspiration(ctx),
    runCommand: runCommand(ctx),
    webScrape: webScrape(ctx),
    submitDesignBrief: submitDesignBrief(ctx),
    submitDesignStudy: submitDesignStudy(ctx),
    finishBuild: finishBuild(ctx),
  };
}

export type ToolName = keyof ReturnType<typeof tools>;

export type ToolSet = InferUITools<ReturnType<typeof tools>>;
