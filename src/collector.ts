import { Store, type Tokens } from "./store";

type Info = { id: string; sessionID?: string; role?: string; providerID?: string; modelID?: string };
export type UsageEvent = { type: string; properties: { info?: Info; part?: {type:string;id:string;sessionID:string;messageID:string;tokens?:Tokens} } };
export function capture(store: Store, event: UsageEvent, device: string, at = Date.now()) {
  const info = event.properties.info;
  if (event.type === "message.updated" && info?.role === "assistant" && info.sessionID) {
    store.message(info.id, info.sessionID, info.providerID, info.modelID);
  } else if (event.type === "message.part.updated") {
    const part = event.properties.part;
    if (part?.type === "step-finish" && part.tokens && part.id && part.sessionID && part.messageID) {
      store.step({session:part.sessionID,message:part.messageID,part:part.id,device,at,tokens:part.tokens});
      return {session:part.sessionID,message:part.messageID};
    }
  }
}
