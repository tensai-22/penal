import React, { useRef, useState, useEffect, useCallback } from "react";
import { Box } from "@mui/material";

/**
 * AutoFit (SOLO ALTURA)
 * ------------------------------------------------------------
 * - NO toca el ancho
 * - NO genera scroll en body
 * - Ajusta el contenido verticalmente para que entre en 1 pantalla
 * - Ideal para layouts con AppBar + Tabs + tablas internas con scroll propio
 *
 * Props:
 *  - minScale : escala mínima permitida (default 0.75)
 *  - maxScale : escala máxima (default 1)
 *  - vpad     : padding vertical de seguridad (px)
 */
export default function AutoFit({
    children,
    minScale = 0.75,
    maxScale = 1,
    vpad = 8,
}) {
    const innerRef = useRef(null);
    const [scaleY, setScaleY] = useState(1);

    const recalc = useCallback(() => {
        const el = innerRef.current;
        if (!el) return;

        const contentHeight = el.scrollHeight;
        const viewportHeight = window.innerHeight - vpad;

        if (!contentHeight || !viewportHeight) return;

        // Calculamos SOLO escala vertical
        const nextScale = Math.max(
            minScale,
            Math.min(maxScale, viewportHeight / contentHeight)
        );

        setScaleY(nextScale);
    }, [minScale, maxScale, vpad]);

    useEffect(() => {
        recalc();

        const ro = new ResizeObserver(recalc);
        if (innerRef.current) ro.observe(innerRef.current);

        window.addEventListener("resize", recalc);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", recalc);
        };
    }, [recalc]);

    return (
        <Box
            sx={{
                height: "100vh",
                width: "100%",
                overflow: "hidden",          // 🔒 NO scroll global
                display: "flex",
                flexDirection: "column",
            }}
        >
            <Box
                sx={{
                    transform: `scaleY(${scaleY})`,
                    transformOrigin: "top",
                    height: `${100 / scaleY}vh`, // compensación exacta
                    width: "100%",               // 👈 ancho intacto
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <Box ref={innerRef} sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
