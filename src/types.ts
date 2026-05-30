export interface WAConnectedUser {
  id: string;
  name: string;
}

export interface WAMessage {
  id: string;
  from: string;
  senderName: string;
  message: string;
  timestamp: number;
  fromMe: boolean;
  type: string;
}

export interface WAStatusResponse {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
  phoneNumber: string | null;
  pairingCode: string | null;
  error: string | null;
  connectedUser: WAConnectedUser | null;
}
