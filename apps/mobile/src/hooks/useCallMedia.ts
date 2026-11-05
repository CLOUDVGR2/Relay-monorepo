
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import type { Socket } from 'socket.io-client';

export type MediaCall = {
  id: string;
  type: 'AUDIO';
  status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  initiatorId: string;
};

type MediaStatus = 'idle' | 'connecting' | 'connected' | 'failed';

type SignalPayload = {
  callId: string;
  fromUserId?: string;
  description?: {
    type: 'offer' | 'answer';
    sdp: string;
  };
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

export function useCallMedia(
  call: MediaCall | null,
  userId: string,
  socket: Socket | null,
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [recordingAuthorized, setRecordingAuthorized] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const remoteRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<NonNullable<SignalPayload['candidate']>[]>([]);
  const offerStartedRef = useRef(false);
  const mountedRef = useRef(true);

  const callId = call?.id;
  const initiatorId = call?.initiatorId;
  const active = call?.status === 'ACTIVE';

  const cleanup = useCallback(() => {
    if (callId) {
      socket?.emit('call:leave', { callId });
    }

    peerRef.current?.close();
    peerRef.current = null;

    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current?.release();
    localRef.current = null;

    remoteRef.current?.release();
    remoteRef.current = null;

    pendingIceRef.current = [];
    offerStartedRef.current = false;

    if (mountedRef.current) {
      setLocalStream(null);
      setRemoteStream(null);
      setStatus('idle');
      setMuted(false);
      setRecordingAuthorized(false);
    }
  }, [callId, socket]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || !callId || !initiatorId || !socket) {
      setRecordingAuthorized(false);
      return;
    }

    // Recording permission is always re-established by the server per call.
    setRecordingAuthorized(false);

    let disposed = false;
    let joined = false;
    let peerConnected = false;
    let makingOfferPeer: RTCPeerConnection | null = null;
    let setupPeer: RTCPeerConnection | null = null;
    let setupStream: MediaStream | null = null;
    let pendingOffer: SignalPayload | null = null;

    const isOfferer =
      initiatorId.toLowerCase() === userId.toLowerCase();

    const isCurrentSignal = (payload: SignalPayload) =>
      !disposed &&
      payload?.callId === callId &&
      (!payload.fromUserId ||
        payload.fromUserId.toLowerCase() !== userId.toLowerCase());

    const fail = (code: string) => {
      if (!disposed) {
        setStatus('failed');
        console.warn('[Relay media] Call setup failed:', code);
      }
    };

    const attachPeerConnection = (stream: MediaStream) => {
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      setupPeer = peer;
      peerRef.current = peer;

      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });

      peer.onicecandidate = (
        event: { candidate: { toJSON(): NonNullable<SignalPayload['candidate']> } | null },
      ) => {
        if (!disposed && peerRef.current === peer && event.candidate) {
          socket.emit('call:ice', {
            callId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      peer.ontrack = (event: {
        streams: MediaStream[];
        track?: Parameters<MediaStream['addTrack']>[0] | null;
      }) => {
        if (disposed || peerRef.current !== peer) return;

        const associatedStream = event.streams[0];
        if (associatedStream) {
          remoteRef.current = associatedStream;
          setRemoteStream(associatedStream);
        } else if (event.track) {
          // Handle a remote track delivered without an associated stream.
          const stream = remoteRef.current ?? new MediaStream();
          if (!stream.getTrackById(event.track.id)) {
            stream.addTrack(event.track);
          }
          remoteRef.current = stream;
          setRemoteStream(stream);
        }

        console.info('[Relay media] Remote track received', {
          kind: event.track?.kind ?? 'unknown',
          associatedStream: Boolean(associatedStream),
          remoteTrackCount: remoteRef.current?.getTracks().length ?? 0,
        });
      };

      peer.onconnectionstatechange = () => {
        if (disposed || peerRef.current !== peer) return;

        console.info('[Relay media] Peer connection state:', peer.connectionState);
        if (peer.connectionState === 'connected') {
          setStatus('connected');
        } else if (peer.connectionState === 'failed') {
          setStatus('failed');
        } else if (
          peer.connectionState === 'connecting' ||
          peer.connectionState === 'disconnected'
        ) {
          setStatus('connecting');
        }
      };

      peer.oniceconnectionstatechange = () => {
        if (disposed || peerRef.current !== peer) return;
        console.info('[Relay media] ICE connection state:', peer.iceConnectionState);
      };
    };

    const resetPeerConnection = () => {
      if (disposed) return;

      const previousPeer = peerRef.current;
      if (previousPeer) {
        previousPeer.onicecandidate = null;
        previousPeer.ontrack = null;
        previousPeer.onconnectionstatechange = null;
        previousPeer.oniceconnectionstatechange = null;
        previousPeer.close();
      }

      peerRef.current = null;
      pendingIceRef.current = [];
      pendingOffer = null;
      offerStartedRef.current = false;

      const previousRemote = remoteRef.current;
      remoteRef.current = null;
      previousRemote?.release();
      setRemoteStream(null);
      setStatus('connecting');

      const stream = localRef.current;
      if (!stream) return;

      attachPeerConnection(stream);

      if (joined && peerConnected && isOfferer) {
        void createOffer();
      }
    };

    const createOffer = async () => {
      const peer = peerRef.current;

      if (
        !peer ||
        makingOfferPeer === peer ||
        offerStartedRef.current ||
        peer.signalingState !== 'stable'
      ) {
        return;
      }

      makingOfferPeer = peer;
      offerStartedRef.current = true;

      try {
        const offer = await peer.createOffer();
        if (disposed || peerRef.current !== peer) return;

        await peer.setLocalDescription(offer);
        if (disposed || peerRef.current !== peer) return;

        const description = peer.localDescription?.toJSON();
        if (description?.sdp) {
          console.info('[Relay media] Sending offer', { callId });
          socket.emit('call:offer', { callId, description });
        }
      } catch (error) {
        console.warn('[Relay media] Offer creation error:', error);
        if (!disposed && peerRef.current === peer) {
          offerStartedRef.current = false;
          fail('OFFER_FAILED');
        }
      } finally {
        if (makingOfferPeer === peer) {
          makingOfferPeer = null;
        }
      }
    };

    const onJoined = (payload: {
      callId: string;
      peerConnected: boolean;
      recordingAuthorized?: boolean;
    }) => {
      if (disposed || payload?.callId !== callId) return;

      joined = true;
      peerConnected = payload.peerConnected;
      console.info(
        '[MOBILE]',
        typeof payload.recordingAuthorized === 'boolean' ? '[PASS]' : '[FAIL]',
        'Received call:joined authorization',
        {
          callId,
          recordingAuthorized: payload.recordingAuthorized,
          type: typeof payload.recordingAuthorized,
        },
      );
      setRecordingAuthorized(payload.recordingAuthorized === true);
      console.info('[Relay media] Joined call', {
        callId,
        peerConnected,
        recordingAuthorized: payload.recordingAuthorized,
        isOfferer,
      });

      if (isOfferer && peerConnected) {
        void createOffer();
      }
    };

    const onRecordingAuthorization = (payload: {
      callId: string;
      recordingAuthorized: boolean;
    }) => {
      console.info('[Relay media] Recording authorization event', payload);
      if (disposed || payload?.callId !== callId) return;
      console.info(
        '[MOBILE]',
        typeof payload.recordingAuthorized === 'boolean' ? '[PASS]' : '[FAIL]',
        'Received recording authorization update',
        payload,
      );
      setRecordingAuthorized(payload.recordingAuthorized === true);
    };

    const onPeerJoined = (payload: { callId: string }) => {
      if (disposed || payload?.callId !== callId) return;
      peerConnected = true;
      if (isOfferer) void createOffer();
    };

    const onPeerLeft = (payload: { callId: string }) => {
      if (disposed || payload?.callId !== callId) return;
      peerConnected = false;
      resetPeerConnection();
    };

    const flushPendingIce = async (peer: RTCPeerConnection) => {
      const candidates = pendingIceRef.current.splice(0);

      for (const candidate of candidates) {
        if (disposed || peerRef.current !== peer) return;
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const onOffer = async (payload: SignalPayload) => {
      if (!isCurrentSignal(payload) || !payload.description?.sdp) return;

      const peer = peerRef.current;
      if (isOfferer) return;
      if (!peer) {
        pendingOffer = payload;
        console.info('[Relay media] Queued offer until peer is ready', { callId });
        return;
      }

      console.info('[Relay media] Received offer', { callId });

      try {
        await peer.setRemoteDescription(
          new RTCSessionDescription(payload.description),
        );

        await flushPendingIce(peer);

        const answer = await peer.createAnswer();
        if (disposed || peerRef.current !== peer) return;

        await peer.setLocalDescription(answer);
        const description = peer.localDescription?.toJSON();

        if (description?.sdp && !disposed) {
          console.info('[Relay media] Sending answer', { callId });
          socket.emit('call:answer', { callId, description });
        }
      } catch (error) {
        console.warn('[Relay media] Offer processing error:', error);
        fail('OFFER_PROCESSING_FAILED');
      }
    };

    const onAnswer = async (payload: SignalPayload) => {
      if (!isCurrentSignal(payload) || !payload.description?.sdp) return;

      const peer = peerRef.current;
      if (
        !peer ||
        !isOfferer ||
        peer.signalingState !== 'have-local-offer'
      ) {
        return;
      }

      console.info('[Relay media] Received answer', { callId });
      try {
        await peer.setRemoteDescription(
          new RTCSessionDescription(payload.description),
        );
        await flushPendingIce(peer);
      } catch (error) {
        console.warn('[Relay media] Answer processing error:', error);
        fail('ANSWER_PROCESSING_FAILED');
      }
    };

    const onIce = async (payload: SignalPayload) => {
      if (!isCurrentSignal(payload) || !payload.candidate) return;

      const peer = peerRef.current;
      if (!peer) return;

      if (!peer.remoteDescription) {
        pendingIceRef.current.push(payload.candidate);
        return;
      }

      try {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        fail('ICE_CANDIDATE_FAILED');
      }
    };

    const onCallError = (payload: { callId?: string; code?: string }) => {
      if (disposed || payload?.callId !== callId) return;
      fail(payload?.code ?? 'SIGNALING_FAILED');
    };

    const onDisconnect = () => {
      if (disposed) return;

      console.warn('[MOBILE][FAIL] Socket disconnected during call', {
        callId,
      });

      joined = false;
      peerConnected = false;
      setRecordingAuthorized(false);
      resetPeerConnection();
    };

    const joinCall = () => {
      if (disposed || joined) return;
      socket.emit('call:join', { callId });
    };

    const setup = async () => {
      setStatus('connecting');

      socket.on('call:joined', onJoined);
      socket.on('call:recording-authorization', onRecordingAuthorization);
      socket.on('call:peer-joined', onPeerJoined);
      socket.on('call:peer-left', onPeerLeft);
      socket.on('call:offer', onOffer);
      socket.on('call:answer', onAnswer);
      socket.on('call:ice', onIce);
      socket.on('call:error', onCallError);
      socket.on('disconnect', onDisconnect);
      socket.on('connect', joinCall);

      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          stream.release();
          return;
        }

        setupStream = stream;
        localRef.current = stream;
        setLocalStream(stream);

        attachPeerConnection(stream);

        // An offer can arrive while getUserMedia is still pending.
        const queuedOffer = pendingOffer;
        pendingOffer = null;
        if (queuedOffer) {
          void onOffer(queuedOffer);
        }

        // The signaling join can complete before media setup does.
        if (joined && peerConnected && isOfferer) {
          void createOffer();
        }

        if (socket.connected) {
          joinCall();
        }
      } catch {
        fail('MEDIA_PERMISSION_OR_SETUP_FAILED');
      }
    };

    void setup();

    return () => {
      disposed = true;

      socket.off('call:joined', onJoined);
      socket.off('call:recording-authorization', onRecordingAuthorization);
      socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:peer-left', onPeerLeft);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
      socket.off('call:error', onCallError);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', joinCall);

      socket.emit('call:leave', { callId });

      setupPeer?.close();
      if (peerRef.current === setupPeer) {
        peerRef.current = null;
      }

      setupStream?.getTracks().forEach((track) => track.stop());
      setupStream?.release();

      if (localRef.current === setupStream) {
        localRef.current = null;
      }

      remoteRef.current?.release();
      remoteRef.current = null;

      pendingIceRef.current = [];
      offerStartedRef.current = false;
    };
  }, [active, callId, initiatorId, socket, userId]);

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;

    localRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setMuted(nextMuted);
  }, [muted]);

  return {
    localStream,
    remoteStream,
    status,
    muted,
    recordingAuthorized,
    toggleMute,
    cleanup,
  };
}
