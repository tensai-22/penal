// src/hooks/usePermisos.js
import { useState, useEffect } from 'react';

export function usePermisos() {
    const [me, setMe] = useState({
        username: "",
        role: "user",
        allowedFields: [],
        canEdit: false,
        loading: true
    });

    useEffect(() => {
        fetch("/api/me", { credentials: "include" })
            .then(r => {
                if (!r.ok) throw new Error("Error en /api/me");
                return r.json();
            })
            .then(data => {
                setMe({
                    username: data.username || "",
                    role: data.role || "user",
                    allowedFields: data.allowedFields || [],
                    canEdit: !!data.canEdit, // asegura booleano
                    loading: false
                });
            })
            .catch(() => {
                setMe(m => ({ ...m, loading: false }));
            });
    }, []);

    return me;
}
