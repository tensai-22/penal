import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Badge,
    Collapse,
    IconButton,
    Typography,
    Paper,
    Button,
    Link,
    CircularProgress
} from '@mui/material';
import { ExpandLess, ExpandMore, MarkEmailUnread } from '@mui/icons-material';

const API_BASE_URL = 'http://10.50.5.49:5001';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [expandedRegistro, setExpandedRegistro] = useState(null);
    const [details, setDetails] = useState({});
    const [loadingDetails, setLoadingDetails] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(`${API_BASE_URL}/api/notifications`, { withCredentials: true });
            const groupedNotifications = data.notifications.reduce((acc, item) => {
                const key = item.registro_ppu;
                if (!acc[key]) {
                    acc[key] = {
                        registro_ppu: key,
                        unread_count: parseInt(item.unread_count, 10),
                        fecha_version_min: item.fecha_version_min,
                        details: []
                    };
                }
                acc[key].details.push(item);
                return acc;
            }, {});
            setNotifications(Object.values(groupedNotifications));
        } catch (error) {
            console.error("Error al obtener notificaciones:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDetails = async (registro_ppu) => {
        setLoadingDetails(prev => ({ ...prev, [registro_ppu]: true }));
        try {
            const { data } = await axios.get(`${API_BASE_URL}/api/notifications/details`, {
                params: { registro_ppu },
                withCredentials: true
            });
            setDetails(prev => ({ ...prev, [registro_ppu]: data.details }));
        } catch (error) {
            console.error("Error al obtener detalles:", error);
        } finally {
            setLoadingDetails(prev => ({ ...prev, [registro_ppu]: false }));
        }
    };

    const handleToggle = (registro_ppu) => {
        if (expandedRegistro === registro_ppu) {
            setExpandedRegistro(null);
        } else {
            setExpandedRegistro(registro_ppu);
            if (!details[registro_ppu]) {
                fetchDetails(registro_ppu);
            }
        }
    };

    const markAllAsRead = async (registro_ppu, leido) => {
        try {
            await axios.post(`${API_BASE_URL}/api/notifications/mark_read`, { registro_ppu, leido });

            setDetails(prevDetails => {
                const updatedDetails = prevDetails[registro_ppu].map(detail => ({
                    ...detail,
                    leido: leido
                }));

                // Actualizar la UI inmediatamente
                setNotifications(prevNotifications =>
                    prevNotifications.map(noti =>
                        noti.registro_ppu === registro_ppu
                            ? { ...noti, unread_count: leido === 0 ? updatedDetails.length : 0 }
                            : noti
                    )
                );

                return { ...prevDetails, [registro_ppu]: updatedDetails };
            });
        } catch (error) {
            console.error("Error al marcar todas las notificaciones como leídas/no leídas:", error);
        }
    };


    const markIndividualAsRead = async (id, registro_ppu, leido) => {
        if (!id || leido === undefined) {
            console.error("Error: 'id' o 'leido' no definidos correctamente.", { id, leido });
            return;
        }

        try {
            await axios.post(`${API_BASE_URL}/api/notifications/mark_read_individual`, { id, leido });

            setDetails(prevDetails => {
                const updatedDetails = prevDetails[registro_ppu].map(detail =>
                    detail.id === id ? { ...detail, leido } : detail
                );

                // Recalcular si todas las notificaciones están leídas
                const allRead = updatedDetails.every(detail => detail.leido);
                const unreadCount = updatedDetails.filter(detail => !detail.leido).length;

                // Actualizar el estado global de notificaciones
                setNotifications(prevNotifications =>
                    prevNotifications.map(noti =>
                        noti.registro_ppu === registro_ppu
                            ? { ...noti, unread_count: unreadCount }
                            : noti
                    )
                );

                return { ...prevDetails, [registro_ppu]: updatedDetails };
            });
        } catch (error) {
            console.error("Error al marcar como leída la notificación individual:", error);
        }
    };


    return (
        <Paper elevation={4} sx={{ p: 3, maxWidth: 1200, margin: 'auto', backgroundColor: '#f8f9fa' }}>
            <Typography variant="h5" gutterBottom sx={{ textAlign: 'center', fontWeight: 'bold', color: '#333' }}>
                Notificaciones
            </Typography>
            {loading ? (
                <Typography variant="body2" sx={{ textAlign: 'center' }}>Cargando notificaciones...</Typography>
            ) : (
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ backgroundColor: '#e0e0e0' }}>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Registro PPU</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Fecha</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Acción</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {notifications.map((item) => (
                                <React.Fragment key={item.registro_ppu}>
                                    <TableRow sx={{ backgroundColor: item.unread_count > 0 ? '#ffdddd' : '#f0f0f0' }}>
                                        <TableCell>
                                            <IconButton onClick={() => handleToggle(item.registro_ppu)}>
                                                {expandedRegistro === item.registro_ppu ? <ExpandLess /> : <ExpandMore />}
                                            </IconButton>
                                            <Typography sx={{ fontWeight: 'bold', color: '#007bff' }}>{item.registro_ppu}</Typography>
                                        </TableCell>
                                        <TableCell>{new Date(item.fecha_version_min).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <Badge badgeContent={item.unread_count} color="error" showZero>
                                                <MarkEmailUnread />
                                            </Badge>
                                            <Button variant="outlined" size="small" sx={{ ml: 1 }} onClick={() => markAllAsRead(item.registro_ppu, 1)}>
                                                Marcar todo como leído
                                            </Button>
                                            <Button variant="outlined" size="small" sx={{ ml: 1 }} onClick={() => markAllAsRead(item.registro_ppu, 0)}>
                                                Marcar todo como no leído
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                    <Collapse in={expandedRegistro === item.registro_ppu} timeout="auto" unmountOnExit>
                                        <Box sx={{ pl: 4, pb: 2, backgroundColor: '#f1f1f1', borderRadius: '8px', mt: 1 }}>
                                            {loadingDetails[item.registro_ppu] ? (
                                                <CircularProgress size={24} />
                                            ) : details[item.registro_ppu]?.length ? (
                                                <Table size="small">
                                                    <TableBody>
                                                        {details[item.registro_ppu].map(detail => (
                                                            <TableRow key={detail.id} sx={{ backgroundColor: detail.leido ? '#f0f0f0' : '#ffdddd' }}>
                                                                <TableCell>{detail.e_situacional}</TableCell>
                                                                <TableCell>{detail.fecha_version}</TableCell>
                                                                <TableCell>
                                                                    {detail.ruta ? (
                                                                        <Link
                                                                            href={`${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(detail.ruta)}`}
                                                                            target="_blank"
                                                                            color="primary"
                                                                            onClick={(e) => {
                                                                                e.preventDefault(); // Evita que el enlace se abra antes de cambiar el estado
                                                                                markIndividualAsRead(detail.id, item.registro_ppu, 1);
                                                                                setTimeout(() => {
                                                                                    window.open(`${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(detail.ruta)}`, "_blank");
                                                                                }, 500); // Da tiempo para que la API procese el cambio
                                                                            }}
                                                                        >
                                                                            Descargar PDF
                                                                        </Link>

                                                                    ) : "No disponible"}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Button
                                                                        variant="outlined"
                                                                        size="small"
                                                                        sx={{ ml: 1 }}
                                                                        onClick={() => markIndividualAsRead(detail.id, item.registro_ppu, detail.leido ? 0 : 1)}
                                                                    >
                                                                        {detail.leido ? "Marcar como no leído" : "Marcar como leído"}
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <Typography>No hay detalles.</Typography>
                                            )}
                                        </Box>
                                    </Collapse>
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Paper>
    );
};

export default Notifications;
