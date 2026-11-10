import { NativeModules, Platform } from 'react-native';

export type NativeRecordingResult = {
  path: string;
  sampleRate: number;
  channels: 1;
  /** Raw PCM payload bytes, excluding the WAV header. */
  bytes: number;
  sampleCount: string;
  /** Complete WAV file size, including its header. */
  byteSize: number;
  durationMs: number;
  /** SHA-256 of the complete WAV file. */
  sha256: string;
};

type CallAudioRecorderNativeModule = {
  startRecording(): Promise<boolean>;
  stopRecording(): Promise<NativeRecordingResult>;
  discardRecording(): Promise<boolean>;
};

const nativeModule = NativeModules
  .CallAudioRecorder as CallAudioRecorderNativeModule | undefined;

function getNativeModule(): CallAudioRecorderNativeModule {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error(
      'Native call audio recording is currently available on Android only.',
    );
  }

  return nativeModule;
}

export function startCallAudioRecording(): Promise<boolean> {
  return getNativeModule().startRecording();
}

export function stopCallAudioRecording(): Promise<NativeRecordingResult> {
  return getNativeModule().stopRecording();
}

export function discardCallAudioRecording(): Promise<boolean> {
  return getNativeModule().discardRecording();
}
