"use client";

/**
 * Audio device enumeration for the Voice settings pickers. Labels are only populated once the page
 * has been granted mic permission at least once (a browser privacy rule), so the picker prompts for
 * access if labels come back blank.
 */

export type AudioDevice = { deviceId: string; label: string };

export async function listAudioDevices(): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[] }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { inputs: [], outputs: [] };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const map = (kind: MediaDeviceKind, fallback: string) =>
    devices
      .filter((d) => d.kind === kind)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
  return { inputs: map("audioinput", "Microphone"), outputs: map("audiooutput", "Speaker") };
}

/** Ask for mic permission so enumerateDevices returns real labels; resolves false if denied. */
export async function ensureDeviceLabels(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/** True if the browser can route audio output to a chosen device (AudioContext.setSinkId). */
export function canRouteOutput(): boolean {
  return typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
}
