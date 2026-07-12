import { io } from 'socket.io-client';
import { API_BASE_URL } from './config';

const Socket = io(API_BASE_URL, {
    autoConnect: false
});

export default Socket;
