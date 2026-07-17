import { useEffect, useRef } from "react";
import type { StoryboardGateway } from "../data/gateway";
import type { ProjectEvent } from "../domain/models";

type UseProjectRealtimeInput = {
  gateway: StoryboardGateway;
  projectId: string;
  onEvent: (event: ProjectEvent) => void;
};

export function useProjectRealtime({
  gateway,
  projectId,
  onEvent,
}: UseProjectRealtimeInput) {
  const listener = useRef(onEvent);
  listener.current = onEvent;

  useEffect(
    () => gateway.subscribeProject(projectId, (event) => listener.current(event)),
    [gateway, projectId],
  );
}
