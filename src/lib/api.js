// src/lib/api.js
import axios from "axios";

const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL ||
    `${window.location.protocol}//${window.location.hostname}:5001`;

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true, // manda la cookie de sesión para @login_required
});

export default api;
