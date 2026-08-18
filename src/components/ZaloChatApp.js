import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { socket } from '../services/zaloSocketClient';
import { Send, Users, User, LogOut, MessageSquare, RefreshCw, Loader2, Image, Paperclip, Smile, Shield, UserCheck, Edit3, X, FileText, Download } from 'lucide-react';
import './ZaloChat.css';

const BACKEND_URL = process.env.REACT_APP_ZALO_API_URL || 'http://localhost:5000';

export default function ZaloChatApp({ onLogout }) {
    const [recentConversations, setRecentConversations] = useState([]);
    const [myUserId, setMyUserId] = useState('');
    const myUserIdRef = useRef(''); // ref để tránh stale closure khi render
    const [friends, setFriends] = useState([]);
    const [groups, setGroups] = useState([]);
    const [selectedThreadId, setSelectedThreadId] = useState('');
    const [selectedThreadName, setSelectedThreadName] = useState('');
    const [selectedThreadType, setSelectedThreadType] = useState('user'); // 'user' | 'group'
    const [selectedThreadAvatar, setSelectedThreadAvatar] = useState('');
    const [messageText, setMessageText] = useState('');
    const [messages, setMessages] = useState([]);
    const [activeTab, setActiveTab] = useState('recent'); // 'recent' | 'friends' | 'groups'
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchingPhone, setSearchingPhone] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);

    // --- Nâng cấp tính năng Zalo mới ---
    const [showStickerPicker, setShowStickerPicker] = useState(false); // Bảng chọn Emoji Icon
    const stickerPickerRef = useRef(null);
    const [showGroupMembersModal, setShowGroupMembersModal] = useState(false); // Modal quản lý nhóm
    const [groupMembers, setGroupMembers] = useState([]);
    const [loadingGroupMembers, setLoadingGroupMembers] = useState(false);
    const [showAliasModal, setShowAliasModal] = useState(false); // Modal đặt tên gợi nhớ / Alias
    const [aliasTarget, setAliasTarget] = useState(null);
    const [newAliasName, setNewAliasName] = useState('');
    const [savingAlias, setSavingAlias] = useState(false);

    // Lazy load bạn bè: số lượng hiển thị
    const [friendsVisible, setFriendsVisible] = useState(10);
    const friendsListRef = useRef(null);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);
    // Ref để track selectedThreadId bên trong socket handler (tránh stale closure)
    const selectedThreadIdRef = useRef('');

    // Tự động đóng Sticker Picker khi click ngoài
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (stickerPickerRef.current && !stickerPickerRef.current.contains(event.target)) {
                // Kiểm tra không click vào nút toggle sticker
                if (!event.target.closest('.zalo-sticker-toggle-btn')) {
                    setShowStickerPicker(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Chèn Emoji vào ô nhập tin nhắn
    const handleInsertEmoji = (emojiStr) => {
        setMessageText(prev => prev + emojiStr);
        setShowStickerPicker(false);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Giữ ref đồng bộ với state myUserId
    useEffect(() => { myUserIdRef.current = myUserId; }, [myUserId]);

    useEffect(() => {
        loadContacts();

        // Lắng nghe sự kiện tin nhắn mới thời gian thực từ Zalo
        const handleIncomingMessage = (payload) => {
            console.log('Nội dung tin nhắn Zalo mới:', payload);
            const data = payload.data || payload;
            const msgId = data.msgId || payload.msgId || data.cliMsgId;
            const content = data.content || data.msg || payload.content;

            // Xác định threadId — ưu tiên threadId > toId > uidFrom
            // Với tin nhắn đến: uidFrom là người gửi, toId hoặc idTo là mình
            // Với tin nhắn đi:  toId/idTo là người nhận (thread đang chat)
            const rawThreadId = payload.threadId || data.threadId || data.toId || data.idTo || data.uidFrom || '';
            const msgThreadId = String(rawThreadId);

            // Dùng ref để đọc selectedThreadId hiện tại (không bị stale closure)
            const currentThreadId = selectedThreadIdRef.current;

            // Chỉ append vào khung chat nếu tin nhắn thuộc hội thoại đang mở
            if (msgThreadId && currentThreadId && String(msgThreadId) === String(currentThreadId)) {
                setMessages(prev => {
                    // Kiểm tra trùng msgId
                    if (msgId && prev.some(m => {
                        const existingId = m.msgId || (m.data && m.data.msgId) || m.cliMsgId;
                        return existingId && String(existingId) === String(msgId);
                    })) {
                        return prev;
                    }
                    // Tránh trùng với tin nhắn tự gửi tạm thời
                    const isDuplicateContent = prev.some(m => {
                        const mContent = m.content || (m.data && m.data.content);
                        return m.isSelf && mContent === content;
                    });
                    if (isDuplicateContent && msgId) {
                        return prev.map(m => {
                            const mContent = m.content || (m.data && m.data.content);
                            if (m.isSelf && mContent === content) {
                                return { ...m, msgId };
                            }
                            return m;
                        });
                    }
                    return [...prev, data];
                });
            }

            // Cập nhật danh sách "Trò chuyện gần đây"
            const threadId = payload.threadId || data.threadId || data.toId || data.idTo || data.uidFrom;
            if (threadId) {
                setRecentConversations(prev => {
                    const exists = prev.find(item => item.id === String(threadId));
                    if (exists) {
                        return [
                            { ...exists, lastMsg: content || 'Tin nhắn mới', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                            ...prev.filter(item => item.id !== String(threadId))
                        ];
                    } else {
                        const senderName = data.dName || data.senderName || payload.senderName || threadId;
                        return [
                            { id: String(threadId), name: senderName, lastMsg: content || 'Tin nhắn mới', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                            ...prev
                        ];
                    }
                });
            }
        };

        socket.on('zalo-message-received', handleIncomingMessage);

        return () => {
            socket.off('zalo-message-received', handleIncomingMessage);
        };
    }, []);

    const loadContacts = async () => {
        setLoading(true);

        // --- Lấy userId tài khoản đăng nhập trước để đảm bảo có sẵn khi render tin nhắn ---
        try {
            const statusRes = await axios.get(`${BACKEND_URL}/api/zalo/status`);
            const uid = statusRes.data?.user?.zaloId || statusRes.data?.user?.userId || '';
            if (uid) {
                console.log('[ZaloChat] My userId:', uid);
                myUserIdRef.current = uid; // cập nhật ref ngay lập tức
                setMyUserId(String(uid));
            }
        } catch (e) {
            console.warn('[ZaloChat] Cannot fetch status:', e.message);
        }

        // --- Tải bạn bè & Alias (Biệt danh) ---
        let parsedFriends = [];
        try {
            const friendsRes = await axios.get(`${BACKEND_URL}/api/zalo/friends`);
            const rawFriends = friendsRes.data?.friends || friendsRes.data;
            const list = Array.isArray(rawFriends) ? rawFriends : (typeof rawFriends === 'object' && rawFriends ? Object.values(rawFriends) : []);

            // Lấy danh sách Alias trực tiếp từ Zalo API (getAliasList) nếu backend hỗ trợ
            let aliasMap = {};
            try {
                let aliasRes;
                try {
                    aliasRes = await axios.get(`${BACKEND_URL}/api/zalo/aliases`);
                } catch (e1) {
                    if (e1.response?.status === 404) {
                        aliasRes = await axios.get(`${BACKEND_URL}/api/zalo/alias-list`);
                    } else {
                        throw e1;
                    }
                }
                const aliasItems = aliasRes.data?.aliases || aliasRes.data?.items || aliasRes.data || [];
                if (Array.isArray(aliasItems)) {
                    aliasItems.forEach(item => {
                        const uId = item.userId || item.uid;
                        if (uId && item.alias) {
                            aliasMap[String(uId)] = item.alias;
                        }
                    });
                }
            } catch (aliasErr) {
                // Nếu Server Node.js / Express backend chưa đăng ký endpoint này, im lặng bỏ qua để không bắn console error
            }

            // Ưu tiên hiển thị Alias nếu có (aliasMap > alias > friendAlias > nickname > resolvedName > displayName)
            parsedFriends = list.map(f => {
                const userIdStr = String(f.userId || f.uid || '');
                const directAlias = aliasMap[userIdStr] || f.alias || f.friendAlias || f.nickname || f.nickName || '';
                return {
                    ...f,
                    aliasName: directAlias,
                    displayNameResolved: directAlias || f.resolvedName || f.displayName || f.userId
                };
            });
            setFriends(parsedFriends);
        } catch (err) {
            console.error('Lỗi /api/zalo/friends:', err.response?.status, err.response?.data || err.message);
        }

        // --- Tải nhóm ---
        let parsedGroups = [];
        try {
            const groupsRes = await axios.get(`${BACKEND_URL}/api/zalo/groups`);
            const rawGroups = groupsRes.data?.groups || groupsRes.data;
            parsedGroups = Array.isArray(rawGroups) ? rawGroups : (typeof rawGroups === 'object' && rawGroups ? Object.values(rawGroups) : []);
            setGroups(parsedGroups);
        } catch (err) {
            console.error('Lỗi /api/zalo/groups:', err.response?.status, err.response?.data || err.message);
        }

        // --- Tải hội thoại gần đây ---
        try {
            const convRes = await axios.get(`${BACKEND_URL}/api/zalo/conversations`);
            const rawConvs = convRes.data?.conversations;
            // Tạo map để tra cứu nhanh bạn bè theo userId
            const friendsLookup = {};
            parsedFriends.forEach(f => { if (f?.userId) friendsLookup[f.userId] = f; });
            const groupsLookup = {};
            parsedGroups.forEach(g => {
                const id = typeof g === 'string' || typeof g === 'number' ? String(g) : (g?.groupId || g?.id || g?.grid || g?.group_id || g?.gId || g?.threadId || g?.thread_id);
                if (id) groupsLookup[id] = g;
            });

            const mapped = rawConvs.map(c => {
                const threadId = c.thread_id;
                const threadType = c.type || c.thread_type || 'user';
                const friend = threadType !== 'group' ? friendsLookup[threadId] : null;
                const group = threadType === 'group' ? groupsLookup[threadId] : null;
                const displayName = friend?.displayNameResolved || friend?.alias || friend?.friendAlias || friend?.resolvedName || friend?.displayName || group?.name || group?.groupName || c.name || threadId;
                const avatar = friend?.avatar || friend?.avatarUrl || group?.avatar || group?.avatarUrl || group?.fullAvatar || group?.avt || c.avatar || '';
                return {
                    id: threadId,
                    name: displayName,
                    avatar,
                    lastMsg: c.lastMsg || c.content || '',
                    type: threadType,
                    time: c.time || (c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
                };
            }).filter(c => c.id);
            setRecentConversations(mapped);
        } catch (convErr) {
            console.error('Lỗi /api/zalo/conversations:', convErr.response?.status, convErr.response?.data || convErr.message);
            const initialRecent = [
                ...parsedFriends.slice(0, 5).map(f => ({ id: f.userId, name: f.displayNameResolved || f.alias || f.displayName || f.userId, type: 'user' })),
                ...parsedGroups.slice(0, 5).map(g => ({ id: g.groupId, name: g.name || g.groupId, type: 'group' }))
            ];
            setRecentConversations(initialRecent);
        }

        setLoading(false);
    };

    const handleSearchPhone = async (phoneToSearch) => {
        const cleanPhone = (phoneToSearch || searchQuery)?.trim();
        if (!cleanPhone) return;
        setSearchingPhone(true);
        try {
            const res = await axios.get(`${BACKEND_URL}/api/zalo/search-phone?phone=${cleanPhone}`);
            if (res.data?.success && res.data?.found) {
                setSearchResult(res.data.contact);
            } else {
                alert('Không tìm thấy liên hệ Zalo với SĐT này!');
                setSearchResult(null);
            }
        } catch (err) {
            alert('Lỗi tra cứu SĐT: ' + (err.response?.data?.error || err.message));
            setSearchResult(null);
        } finally {
            setSearchingPhone(false);
        }
    };

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        if (!val.trim()) {
            setSearchResult(null);
        }
    };


    const extractMessageArray = (resData) => {
        if (!resData) return [];
        if (Array.isArray(resData)) return resData;
        if (Array.isArray(resData.messages)) return resData.messages;
        if (Array.isArray(resData.data)) return resData.data;
        if (Array.isArray(resData.result)) return resData.result;
        return [];
    };

    const localMessageCacheRef = useRef({}); // Cache local messages per thread ID to prevent losing image URLs

    const handleSelectThread = async (id, name, type = 'user', avatarUrl = '') => {
        const validId = String(id || '').trim();
        if (!validId || validId === 'undefined' || validId === 'null') {
            console.warn('[ZaloChat] Cannot fetch messages for invalid thread ID:', id);
            return;
        }

        let avatar = avatarUrl;
        if (!avatar) {
            if (type === 'group') {
                const g = groupsMap[validId];
                avatar = g?.avatar || g?.avatarUrl || g?.fullAvatar || g?.avt || '';
            } else {
                const f = friendsMap[validId];
                avatar = f?.avatar || f?.avatarUrl || '';
            }
        }

        setSelectedThreadId(validId);
        selectedThreadIdRef.current = validId; // cập nhật ref để socket handler đọc được
        setSelectedThreadName(name || validId);
        setSelectedThreadType(type);
        setSelectedThreadAvatar(avatar);
        setLoadingMessages(true);

        try {
            let fetchedArr = [];
            if (type === 'group') {
                const res = await axios.get(`${BACKEND_URL}/api/zalo/messages/group/${validId}?count=50`);
                fetchedArr = extractMessageArray(res.data);
            } else {
                const res = await axios.get(`${BACKEND_URL}/api/zalo/messages/user/${validId}?limit=50`);
                fetchedArr = extractMessageArray(res.data);
            }

            // Merge fetched history with local cached sent/received messages to preserve image URLs
            const cachedLocal = localMessageCacheRef.current[validId] || [];
            const fetchedMsgIds = new Set(fetchedArr.map(m => m.msgId || m.data?.msgId || m.id));

            const unmergedLocal = cachedLocal.filter(l => !fetchedMsgIds.has(l.msgId || l.id));
            const combined = [...fetchedArr, ...unmergedLocal];

            setMessages(combined);
        } catch (err) {
            console.warn('[ZaloChat] Không thể tải lịch sử tin nhắn (server 500 hoặc chưa có dữ liệu):', err.response?.data?.error || err.message);
            const cachedLocal = localMessageCacheRef.current[validId] || [];
            setMessages(cachedLocal);
        } finally {
            setLoadingMessages(false);
        }
    };

    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        if (!selectedThreadId || !messageText.trim() || sending) return;

        const textToSend = messageText.trim();
        setSending(true);

        try {
            const payload = {
                threadId: selectedThreadId,
                message: textToSend,
                threadType: selectedThreadType
            };

            const res = await axios.post(`${BACKEND_URL}/api/zalo/send-message`, payload);

            if (res.data?.success || res.status === 200) {
                const newMsgId = res.data?.messageId || res.data?.msgId || `self-${Date.now()}`;
                setMessages(prev => {
                    if (prev.some(m => (m.msgId || (m.data && m.data.msgId)) === newMsgId)) return prev;
                    return [...prev, {
                        msgId: newMsgId,
                        isSelf: true,
                        fromMe: true,
                        uidFrom: 'me',
                        content: textToSend,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }];
                });
                updateRecentList(selectedThreadId, selectedThreadName, textToSend, selectedThreadType);
                setMessageText('');
            }
        } catch (err) {
            alert('Gửi tin nhắn thất bại: ' + (err.response?.data?.error || err.message));
        } finally {
            setSending(false);
        }
    };



    // --- Tải danh sách thành viên nhóm & vai trò (Trưởng/Phó nhóm) ---
    const handleFetchGroupMembers = async (groupId) => {
        const targetGroupId = groupId || selectedThreadId;
        if (!targetGroupId) return;
        setShowGroupMembersModal(true);
        setLoadingGroupMembers(true);
        try {
            const res = await axios.get(`${BACKEND_URL}/api/zalo/group-members/${targetGroupId}`);
            const rawList = res.data?.members || res.data?.profiles || res.data;
            const list = Array.isArray(rawList) ? rawList : (typeof rawList === 'object' && rawList ? Object.values(rawList) : []);
            setGroupMembers(list);
        } catch (err) {
            console.error('Lỗi tải danh sách thành viên nhóm:', err);
            // Fallback dummy nếu server chưa có endpoint
            setGroupMembers([]);
        } finally {
            setLoadingGroupMembers(false);
        }
    };

    // --- Lưu biệt danh (Alias) bạn bè Zalo ---
    const handleOpenAliasModal = (friend) => {
        setAliasTarget(friend);
        setNewAliasName(friend.aliasName || friend.alias || friend.displayName || '');
        setShowAliasModal(true);
    };

    const handleSaveAlias = async () => {
        if (!aliasTarget || !newAliasName.trim() || savingAlias) return;
        setSavingAlias(true);
        try {
            const res = await axios.post(`${BACKEND_URL}/api/zalo/set-alias`, {
                userId: aliasTarget.userId,
                alias: newAliasName.trim()
            });
            if (res.data?.success || res.status === 200) {
                alert('Cập nhật biệt danh thành công!');
                // Cập nhật state bạn bè tại chỗ
                setFriends(prev => prev.map(f => {
                    if (f.userId === aliasTarget.userId) {
                        return {
                            ...f,
                            aliasName: newAliasName.trim(),
                            displayNameResolved: newAliasName.trim()
                        };
                    }
                    return f;
                }));
                setShowAliasModal(false);
            }
        } catch (err) {
            alert('Đổi biệt danh thất bại: ' + (err.response?.data?.error || err.message));
        } finally {
            setSavingAlias(false);
        }
    };

    // Upload hình ảnh hoặc đính kèm file theo API mới
    const handleFileUpload = async (e, type) => {
        const file = e.target.files?.[0];
        if (!file || !selectedThreadId) return;

        setUploading(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('threadId', selectedThreadId);
        formData.append('threadType', selectedThreadType);
        if (type === 'image') {
            formData.append('caption', file.name);
        }

        const endpoint = type === 'image' ? '/api/zalo/send-image' : '/api/zalo/send-file';

        try {
            const res = await axios.post(`${BACKEND_URL}${endpoint}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data?.success || res.status === 200) {
                const localUrl = URL.createObjectURL(file);
                const serverPublicUrl = res.data?.publicUrl || res.data?.result?.publicUrl || res.data?.url || res.data?.result?.url;
                const permanentUrl = serverPublicUrl ? (serverPublicUrl.startsWith('http') ? serverPublicUrl : `${BACKEND_URL}${serverPublicUrl}`) : localUrl;

                const newMsgId = res.data?.messageId || res.data?.msgId || `upload-${Date.now()}`;
                const formattedSize = file.size / 1024 < 1024
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

                const newMsg = {
                    msgId: newMsgId,
                    isSelf: true,
                    fromMe: true,
                    uidFrom: 'me',
                    msgType: type === 'image' ? 'photo' : 'share.file',
                    content: file.name,
                    fileTitle: file.name,
                    fileUrl: permanentUrl,
                    fileSize: formattedSize,
                    thumbUrl: type === 'image' ? permanentUrl : null,
                    href: permanentUrl,
                    url: permanentUrl,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };

                setMessages(prev => {
                    const updated = [...prev, newMsg];
                    localMessageCacheRef.current[selectedThreadId] = updated;
                    return updated;
                });
                updateRecentList(selectedThreadId, selectedThreadName, type === 'image' ? `[Hình ảnh: ${file.name}]` : `[File: ${file.name}]`, selectedThreadType);
            }
        } catch (err) {
            alert(`Gửi ${type === 'image' ? 'hình ảnh' : 'file'} thất bại: ` + (err.response?.data?.error || err.message));
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const updateRecentList = (id, name, lastMsg, type = 'user') => {
        setRecentConversations(prev => {
            const filtered = prev.filter(item => item.id !== id);
            return [
                { id, name, lastMsg, type, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                ...filtered
            ];
        });
    };

    const handleLogoutZalo = async () => {
        if (window.confirm('Bạn có chắc chắn muốn đăng xuất phiên Zalo này?')) {
            try {
                await axios.post(`${BACKEND_URL}/api/zalo/logout`);
            } catch (e) {
                console.error(e);
            }
            if (onLogout) onLogout();
        }
    };

    const safeFriends = Array.isArray(friends) ? friends : [];
    const safeGroups = Array.isArray(groups) ? groups : [];

    // Map userId -> friend object & groupId -> group object để lookup avatar nhanh
    const friendsMap = safeFriends.reduce((acc, f) => {
        if (f?.userId) acc[f.userId] = f;
        return acc;
    }, {});

    const getGroupId = (g) => {
        if (!g) return '';
        if (typeof g === 'string' || typeof g === 'number') return String(g);
        return String(g.groupId || g.id || g.grid || g.group_id || g.gId || g.threadId || g.thread_id || '');
    };

    const getGroupName = (g) => {
        if (!g) return '';
        if (typeof g === 'string' || typeof g === 'number') return String(g);
        return g.name || g.groupName || g.nameGroup || g.grid || getGroupId(g);
    };

    const groupsMap = safeGroups.reduce((acc, g) => {
        const id = getGroupId(g);
        if (id) acc[id] = g;
        return acc;
    }, {});

    const filteredRecent = recentConversations.filter(c =>
        (c.name || c.id || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredFriends = safeFriends.filter(f =>
        (f?.aliasName || f?.displayNameResolved || f?.alias || f?.friendAlias || f?.nickname || f?.resolvedName || f?.displayName || f?.userId || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredGroups = safeGroups.filter(g => {
        const groupId = getGroupId(g);
        const name = getGroupName(g);
        return groupId && (name || groupId).toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Khi searchQuery thay đổi → reset lại trang lazy load
    useEffect(() => {
        setFriendsVisible(10);
    }, [searchQuery]);

    // Scroll handler cho danh sách bạn bè
    const handleFriendsScroll = (e) => {
        const el = e.currentTarget;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (nearBottom) {
            setFriendsVisible(prev => Math.min(prev + 10, filteredFriends.length));
        }
    };

    // Bạn bè đang hiển thị (lazy load)
    const visibleFriends = filteredFriends.slice(0, friendsVisible);
    const hasMoreFriends = friendsVisible < filteredFriends.length;


    return (
        <div className="zalo-wrapper">
            <div className="zalo-chat-container">
                {/* Sidebar */}
                <div className="zalo-sidebar">
                    <div className="zalo-sidebar-header">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#0068ff', fontSize: '1.1rem' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#0068ff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem' }}>Z</div>
                                <span>Zalo Chat</span>
                            </div>
                            <button onClick={loadContacts} title="Tải lại danh bạ" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                <RefreshCw size={16} />
                            </button>
                        </div>
                        <div style={{ position: 'relative', display: 'flex', gap: '0.4rem' }}>
                            <input
                                type="text"
                                className="zalo-search-box"
                                placeholder="Tìm trò chuyện, bạn bè, SĐT..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && searchQuery.trim()) {
                                        handleSearchPhone(searchQuery);
                                    }
                                }}
                            />
                            {searchQuery.trim() && (
                                <button
                                    type="button"
                                    className="zalo-btn-primary"
                                    onClick={() => handleSearchPhone(searchQuery)}
                                    disabled={searchingPhone}
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', whiteSpace: 'nowrap', borderRadius: 20 }}
                                    title="Tìm kiếm liên hệ theo SĐT trên Zalo"
                                >
                                    {searchingPhone ? <Loader2 className="spinner" size={14} /> : 'Tìm SĐT'}
                                </button>
                            )}
                        </div>

                        {searchResult && (
                            <div style={{ marginTop: '0.6rem', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '0.6rem 0.8rem', borderRadius: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                                    {searchResult.avatarUrl || searchResult.avatar ? (
                                        <img src={searchResult.avatarUrl || searchResult.avatar} alt="" className="zalo-avatar" style={{ width: 32, height: 32 }} />
                                    ) : (
                                        <div className="zalo-avatar" style={{ width: 32, height: 32, fontSize: '0.85rem' }}>
                                            {(searchResult.alias || searchResult.resolvedName || searchResult.displayName || 'Z').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0369a1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {searchResult.alias || searchResult.resolvedName || searchResult.displayName}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                            Tên Zalo: {searchResult.displayName || 'Chưa cập nhật'}
                                        </div>
                                        {searchResult.alias && (
                                            <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 500 }}>
                                                Biệt danh (Alias): {searchResult.alias}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>ID: {searchResult.userId}</span>
                                    <button
                                        className="zalo-btn-primary"
                                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: 6 }}
                                        onClick={() => {
                                            const name = searchResult.alias || searchResult.resolvedName || searchResult.displayName || searchResult.userId;
                                            const avatar = searchResult.avatarUrl || searchResult.avatar || '';
                                            handleSelectThread(searchResult.userId, name, 'user', avatar);
                                        }}
                                    >
                                        Chat Ngay
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Contact Sub-tabs */}
                    <div className="zalo-contact-tabs">
                        <button
                            className={`zalo-tab-btn ${activeTab === 'recent' ? 'active' : ''}`}
                            onClick={() => setActiveTab('recent')}
                        >
                            Gần đây ({recentConversations.length})
                        </button>
                        <button
                            className={`zalo-tab-btn ${activeTab === 'friends' ? 'active' : ''}`}
                            onClick={() => setActiveTab('friends')}
                        >
                            <User size={14} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                            Bạn bè
                        </button>
                        <button
                            className={`zalo-tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
                            onClick={() => setActiveTab('groups')}
                        >
                            <Users size={14} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                            Nhóm
                        </button>
                    </div>

                    {/* Contact List */}
                    <ul
                        className="zalo-contact-list"
                        ref={friendsListRef}
                        onScroll={activeTab === 'friends' ? handleFriendsScroll : undefined}
                    >
                        {loading ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                <Loader2 className="spinner" size={24} />
                                <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Đang tải danh bạ...</p>
                            </div>
                        ) : activeTab === 'recent' ? (
                            filteredRecent.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Chưa có trò chuyện gần đây
                                </div>
                            ) : (
                                filteredRecent.map(c => {
                                    const isSelected = selectedThreadId === c.id;
                                    const friend = c.type !== 'group' ? friendsMap[c.id] : null;
                                    const group = c.type === 'group' ? groupsMap[c.id] : null;
                                    const avatar = c.avatar || friend?.avatar || friend?.avatarUrl || group?.avatar || group?.avatarUrl || group?.fullAvatar || group?.avt || '';
                                    const displayName = friend?.alias || friend?.resolvedName || friend?.displayName || group?.name || group?.groupName || c.name || c.id;
                                    return (
                                        <li
                                            key={c.id}
                                            className={`zalo-contact-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => handleSelectThread(c.id, displayName, c.type || 'user', avatar)}
                                        >
                                            {avatar ? (
                                                <img src={avatar} alt={displayName} className="zalo-avatar" loading="lazy" />
                                            ) : c.type === 'group' ? (
                                                <div className="zalo-avatar group">
                                                    <Users size={20} />
                                                </div>
                                            ) : (
                                                <div className="zalo-avatar">
                                                    {(displayName || 'Z').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="zalo-contact-info">
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <div className="zalo-contact-name">{displayName}</div>
                                                    {c.time && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{c.time}</span>}
                                                </div>
                                                <div className="zalo-contact-subtitle">{c.lastMsg || ''}</div>
                                            </div>
                                        </li>
                                    );
                                })
                            )
                        ) : activeTab === 'friends' ? (
                            filteredFriends.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Không tìm thấy bạn bè nào
                                </div>
                            ) : (
                                <>
                                    {visibleFriends.map(f => {
                                        const name = f.displayNameResolved || f.aliasName || f.alias || f.friendAlias || f.nickname || f.resolvedName || f.displayName || f.userId;
                                        const isSelected = selectedThreadId === f.userId;
                                        return (
                                            <li
                                                key={f.userId}
                                                className={`zalo-contact-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => handleSelectThread(f.userId, name, 'user', f.avatar || f.avatarUrl)}
                                            >
                                                {f.avatar ? (
                                                    <img src={f.avatar} alt={name} className="zalo-avatar" loading="lazy" />
                                                ) : (
                                                    <div className="zalo-avatar">
                                                        {name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="zalo-contact-info">
                                                    <div className="zalo-contact-name">{name}</div>
                                                    <div className="zalo-contact-subtitle">
                                                        {f.displayName && f.displayName !== name ? `Tên Zalo: ${f.displayName}` : (f.aliasName ? `Biệt danh: ${f.aliasName}` : `ID: ${f.userId}`)}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                    {hasMoreFriends && (
                                        <li style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.78rem', userSelect: 'none', borderTop: '1px solid #f1f5f9' }}>
                                            <Loader2 size={13} style={{ verticalAlign: 'middle', marginRight: 4, animation: 'spin 1s linear infinite' }} />
                                            Cuộn xuống để tải thêm ({filteredFriends.length - friendsVisible} người nữa)
                                        </li>
                                    )}
                                </>
                            )
                        ) : (
                            filteredGroups.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Không tìm thấy nhóm nào
                                </div>
                            ) : (
                                filteredGroups.map((g, idx) => {
                                    const groupId = getGroupId(g);
                                    const name = getGroupName(g);
                                    const avatar = typeof g === 'object' && g ? (g.avatar || g.avatarUrl || g.fullAvatar || g.avt || '') : '';
                                    const isSelected = selectedThreadId === groupId;
                                    return (
                                        <li
                                            key={groupId || idx}
                                            className={`zalo-contact-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => groupId && handleSelectThread(groupId, name, 'group', avatar)}
                                        >
                                            {avatar ? (
                                                <img src={avatar} alt={name} className="zalo-avatar" loading="lazy" />
                                            ) : (
                                                <div className="zalo-avatar group">
                                                    <Users size={20} />
                                                </div>
                                            )}
                                            <div className="zalo-contact-info">
                                                <div className="zalo-contact-name">{name}</div>
                                                <div className="zalo-contact-subtitle">Nhóm</div>
                                            </div>
                                        </li>
                                    );
                                })
                            )
                        )}
                    </ul>
                </div>

                {/* Main Chat Box */}
                <div className="zalo-chat-main">
                    {/* Header */}
                    <div className="zalo-chat-header">
                        <div className="zalo-chat-header-user">
                            {selectedThreadId ? (
                                <>
                                    {selectedThreadAvatar ? (
                                        <img src={selectedThreadAvatar} alt={selectedThreadName} className="zalo-avatar" style={{ width: 36, height: 36 }} />
                                    ) : selectedThreadType === 'group' ? (
                                        <div className="zalo-avatar group" style={{ width: 36, height: 36 }}>
                                            <Users size={18} />
                                        </div>
                                    ) : (
                                        <div className="zalo-avatar" style={{ width: 36, height: 36, fontSize: '0.95rem' }}>
                                            {(selectedThreadName || selectedThreadId || 'Z').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#1e293b' }}>{selectedThreadName}</h4>
                                            {selectedThreadType !== 'group' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const friendObj = friendsMap[selectedThreadId] || { userId: selectedThreadId, displayName: selectedThreadName };
                                                        handleOpenAliasModal(friendObj);
                                                    }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', padding: 2 }}
                                                    title="Đặt biệt danh (Alias)"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#059669' }}>● Đang hoạt động ({selectedThreadType === 'group' ? 'Nhóm' : 'Cá nhân'})</span>
                                    </div>
                                </>
                            ) : (
                                <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Vui lòng chọn hội thoại để bắt đầu nhắn tin</span>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {selectedThreadId && selectedThreadType === 'group' && (
                                <button
                                    type="button"
                                    onClick={() => handleFetchGroupMembers(selectedThreadId)}
                                    className="zalo-btn-secondary"
                                    style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                    title="Xem thành viên & quản trị nhóm"
                                >
                                    <Users size={14} /> Thành viên nhóm
                                </button>
                            )}

                            <button
                                onClick={handleLogoutZalo}
                                className="zalo-btn-secondary"
                                style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                title="Đăng xuất tài khoản Zalo"
                            >
                                <LogOut size={14} /> Đăng xuất Zalo
                            </button>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="zalo-messages-area">
                        {!selectedThreadId ? (
                            <div className="zalo-empty-chat">
                                <MessageSquare size={48} strokeWidth={1.5} style={{ marginBottom: '1rem', color: '#cbd5e1' }} />
                                <h3>Chào mừng bạn đến với Zalo Chat</h3>
                                <p style={{ fontSize: '0.9rem', maxWidth: 320 }}>
                                    Chọn một người bạn hoặc nhóm chat từ danh sách bên trái để gửi và nhận tin nhắn.
                                </p>
                            </div>
                        ) : loadingMessages ? (
                            <div className="zalo-empty-chat">
                                <Loader2 className="spinner" size={28} style={{ color: '#0068ff', marginBottom: '0.5rem' }} />
                                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Đang tải lịch sử tin nhắn...</p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="zalo-empty-chat">
                                <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Chưa có tin nhắn nào trong cuộc trò chuyện này.</p>
                            </div>
                        ) : (
                            messages.map((m, idx) => {
                                const msgData = m.data || m;
                                // Xác định tin nhắn của mình: ưu tiên flag isSelf/fromMe,
                                // sau đó so sánh sender_id / uidFrom với userId tài khoản đang đăng nhập.
                                // Messages từ Supabase dùng field "sender_id", messages realtime dùng "uidFrom"
                                const senderUid = String(
                                    msgData.sender_id || msgData.uidFrom || m.sender_id || m.uidFrom || ''
                                );
                                if (idx === 0) console.log('[ZaloChat] myUserId=', myUserId, '| senderUid=', senderUid, '| match=', myUserId && senderUid === myUserId);
                                const isMe = Boolean(
                                    m.isSelf ||
                                    m.fromMe ||
                                    msgData.isSelf ||
                                    msgData.fromMe ||
                                    senderUid === 'me' ||
                                    (myUserIdRef.current && senderUid === myUserIdRef.current) ||
                                    (myUserId && senderUid === myUserId)
                                );

                                let contentText = '';
                                if (typeof msgData.content === 'string') {
                                    contentText = msgData.content;
                                } else if (typeof msgData.msg === 'string') {
                                    contentText = msgData.msg;
                                } else if (typeof m.content === 'string') {
                                    contentText = m.content;
                                } else {
                                    contentText = typeof m === 'string' ? m : (msgData.content ? JSON.stringify(msgData.content) : JSON.stringify(m));
                                }

                                const senderName = msgData.dName || msgData.senderName || msgData.uidFrom || m.uidFrom;
                                const msgTime = msgData.ts
                                    ? new Date(Number(msgData.ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : (m.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

                                // Extract image URL using deplao-zalo heuristics
                                const rawMsgType = String(msgData.msgType || msgData.msg_type || m.msgType || m.msg_type || '');
                                const isPhotoMsgType = ['photo', 'image', 'chat.photo'].includes(rawMsgType);

                                let imageSrc =
                                    m.thumbUrl || m.href || m.url || m.hdUrl || m.oriUrl || m.thumb ||
                                    msgData.thumbUrl || msgData.href || msgData.url || msgData.hdUrl || msgData.oriUrl || msgData.thumb;

                                // Try parsing JSON content
                                let parsedContent = null;
                                if (typeof contentText === 'string' && (contentText.trim().startsWith('{') || contentText.trim().startsWith('['))) {
                                    try { parsedContent = JSON.parse(contentText); } catch (e) { }
                                }

                                if (parsedContent && typeof parsedContent === 'object') {
                                    let params = parsedContent.params;
                                    if (typeof params === 'string') { try { params = JSON.parse(params); } catch { params = null; } }

                                    // File heuristic from deplao-zalo: title + href without rawUrl/hd is a FILE, not an image
                                    const isFileDoc = parsedContent.title && parsedContent.href && !params?.rawUrl && !params?.hd && !isPhotoMsgType;

                                    if (!isFileDoc) {
                                        imageSrc = params?.hd || params?.rawUrl || parsedContent.hd || parsedContent.rawUrl ||
                                            parsedContent.url || parsedContent.hdUrl || parsedContent.href || parsedContent.thumbUrl ||
                                            parsedContent.path || parsedContent.thumb || parsedContent.oriUrl || imageSrc;
                                    }
                                }

                                if (!imageSrc && (msgData.attachments || msgData.attach || m.attachments)) {
                                    const list = msgData.attachments || msgData.attach || m.attachments;
                                    if (Array.isArray(list) && list[0]) {
                                        const item = list[0];
                                        if (typeof item === 'string') {
                                            imageSrc = item;
                                        } else if (item && typeof item === 'object') {
                                            let p = item.params;
                                            if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
                                            imageSrc = p?.hd || p?.rawUrl || item.hdUrl || item.rawUrl || item.normalUrl || item.url || item.href || item.thumbUrl || item.thumb || item.oriUrl || '';
                                        }
                                    } else if (typeof list === 'object') {
                                        let p = list.params;
                                        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
                                        imageSrc = p?.hd || p?.rawUrl || list.hdUrl || list.rawUrl || list.normalUrl || list.url || list.href || list.thumbUrl || list.thumb || list.oriUrl || '';
                                    }
                                }

                                if (!imageSrc && typeof contentText === 'string') {
                                    const trimmed = contentText.trim();
                                    if ((trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) &&
                                        (/\.(jpe?g|png|gif|webp|bmp|heic)(\?.*)?$/i.test(trimmed) || /zdn\.vn|zadn\.vn|zalo\.me|photo|zalo-api/i.test(trimmed))) {
                                        imageSrc = trimmed;
                                    }
                                }

                                if (imageSrc && imageSrc.startsWith('/uploads/')) {
                                    imageSrc = `${BACKEND_URL}${imageSrc}`;
                                }

                                // Extract File details if not image
                                let fileInfo = null;
                                if (!imageSrc) {
                                    const isFileMsgType = rawMsgType.includes('file') || rawMsgType === 'share.file';
                                    let fileTitle = m.fileTitle || msgData.fileTitle || m.fileName || msgData.fileName || '';
                                    let fileUrl = m.fileUrl || msgData.fileUrl || m.href || msgData.href || m.url || msgData.url || '';
                                    let fileSize = m.fileSize || msgData.fileSize || '';

                                    if (parsedContent && typeof parsedContent === 'object') {
                                        let p = parsedContent.params;
                                        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
                                        fileTitle = fileTitle || parsedContent.title || parsedContent.filename || parsedContent.fileName || p?.fileName || p?.title || '';
                                        fileUrl = fileUrl || parsedContent.href || parsedContent.url || parsedContent.normalUrl || p?.fileUrl || p?.url || '';
                                        fileSize = fileSize || parsedContent.fileSize || p?.fileSize || p?.size || '';
                                    }

                                    if (!fileUrl && (msgData.attachments || msgData.attach || m.attachments)) {
                                        const list = msgData.attachments || msgData.attach || m.attachments;
                                        const item = Array.isArray(list) ? list[0] : list;
                                        if (item && typeof item === 'object') {
                                            let p = item.params;
                                            if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
                                            fileTitle = fileTitle || item.title || item.filename || item.name || p?.fileName || '';
                                            fileUrl = fileUrl || item.href || item.url || item.normalUrl || item.fileUrl || '';
                                            fileSize = fileSize || item.size || p?.fileSize || '';
                                        }
                                    }

                                    if (fileUrl && fileUrl.startsWith('/uploads/')) {
                                        fileUrl = `${BACKEND_URL}${fileUrl}`;
                                    }

                                    if (isFileMsgType || (fileTitle && fileUrl)) {
                                        fileInfo = {
                                            title: fileTitle || 'Tệp đính kèm',
                                            url: fileUrl,
                                            size: fileSize
                                        };
                                    }
                                }

                                const isPureImageUrl = imageSrc && contentText && (contentText.trim() === imageSrc || contentText.trim().startsWith('{'));

                                return (
                                    <div key={msgData.msgId || m.msgId || idx} className={`zalo-msg-bubble ${isMe ? 'me' : 'other'}`} style={{ position: 'relative', group: 'msg' }}>
                                        {!isMe && senderName && (
                                            <div className="zalo-msg-sender">{senderName}</div>
                                        )}

                                        {imageSrc ? (
                                            <div style={{ marginTop: 4, marginBottom: 4 }}>
                                                <img
                                                    src={imageSrc}
                                                    alt="Zalo Attachment"
                                                    referrerPolicy="no-referrer"
                                                    style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 8, objectFit: 'cover', cursor: 'pointer' }}
                                                    onClick={() => window.open(imageSrc, '_blank')}
                                                />
                                                {contentText && !isPureImageUrl && <div style={{ marginTop: 4 }}>{contentText}</div>}
                                            </div>
                                        ) : fileInfo ? (
                                            <div style={{
                                                marginTop: 4,
                                                marginBottom: 4,
                                                padding: '8px 12px',
                                                background: isMe ? 'rgba(255, 255, 255, 0.15)' : '#f1f5f9',
                                                borderRadius: 10,
                                                border: '1px solid ' + (isMe ? 'rgba(255, 255, 255, 0.2)' : '#e2e8f0'),
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                maxWidth: 280
                                            }}>
                                                <div style={{
                                                    width: 38,
                                                    height: 38,
                                                    borderRadius: 8,
                                                    background: isMe ? 'rgba(255,255,255,0.25)' : '#e0f2fe',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>
                                                    <FileText size={20} color={isMe ? '#ffffff' : '#0284c7'} />
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontWeight: 600,
                                                        fontSize: '0.85rem',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        color: isMe ? '#fff' : '#0f172a'
                                                    }} title={fileInfo.title}>
                                                        {fileInfo.title}
                                                    </div>
                                                    {fileInfo.size && (
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.85, color: isMe ? 'rgba(255,255,255,0.85)' : '#64748b' }}>
                                                            {fileInfo.size}
                                                        </div>
                                                    )}
                                                </div>
                                                {fileInfo.url && (
                                                    <a
                                                        href={fileInfo.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        download
                                                        style={{
                                                            padding: 6,
                                                            borderRadius: '50%',
                                                            background: isMe ? 'rgba(255,255,255,0.2)' : '#f8fafc',
                                                            color: isMe ? '#fff' : '#0284c7',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                        title="Tải về file"
                                                    >
                                                        <Download size={16} />
                                                    </a>
                                                )}
                                            </div>
                                        ) : (
                                            <div>{contentText}</div>
                                        )}

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
                                            <div className="zalo-msg-time" style={{ fontSize: '0.7rem', opacity: 0.85 }}>{msgTime}</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>



                    {/* Popover chọn Icon Emoji Cảm Xúc Mặc Định Zalo */}
                    {showStickerPicker && (
                        <div
                            ref={stickerPickerRef}
                            style={{
                                background: '#fff',
                                border: '1px solid #e2e8f0',
                                borderRadius: 16,
                                padding: '0.8rem',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(5, 1fr)',
                                gap: '0.5rem',
                                maxWidth: 280,
                                maxHeight: 220,
                                overflowY: 'auto',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                position: 'absolute',
                                bottom: 65,
                                left: 20,
                                zIndex: 100
                            }}
                        >
                            {[
                                '😊', '🥰', '😂', '🤣', '❤️',
                                '💖', '😍', '👍', '👏', '🙏',
                                '😭', '😎', '🥳', '🎉', '🔥',
                                '🤝', '⭐', '✌️', '💯', '💡'
                            ].map((emojiStr, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleInsertEmoji(emojiStr)}
                                    style={{
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 10,
                                        padding: '0.4rem',
                                        fontSize: '1.5rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseOver={e => {
                                        e.currentTarget.style.transform = 'scale(1.2)';
                                        e.currentTarget.style.background = '#e0f2fe';
                                    }}
                                    onMouseOut={e => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.background = '#f8fafc';
                                    }}
                                    title={`Chèn ${emojiStr}`}
                                >
                                    {emojiStr}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Hidden File Inputs */}
                    <input
                        type="file"
                        ref={imageInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={e => handleFileUpload(e, 'image')}
                    />
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={e => handleFileUpload(e, 'file')}
                    />

                    {/* Input Bar */}
                    {selectedThreadId && (
                        <form onSubmit={handleSendMessage} className="zalo-input-bar">
                            <button
                                type="button"
                                className="zalo-btn-secondary zalo-sticker-toggle-btn"
                                style={{ padding: '0.5rem', borderRadius: '50%', border: 'none' }}
                                onClick={() => setShowStickerPicker(!showStickerPicker)}
                                title="Gửi Sticker Zalo"
                            >
                                <Smile size={18} color="#eab308" />
                            </button>

                            <button
                                type="button"
                                className="zalo-btn-secondary"
                                style={{ padding: '0.5rem', borderRadius: '50%', border: 'none' }}
                                onClick={() => imageInputRef.current?.click()}
                                title="Gửi hình ảnh"
                                disabled={uploading}
                            >
                                <Image size={18} color="#0068ff" />
                            </button>

                            <button
                                type="button"
                                className="zalo-btn-secondary"
                                style={{ padding: '0.5rem', borderRadius: '50%', border: 'none' }}
                                onClick={() => fileInputRef.current?.click()}
                                title="Đính kèm file"
                                disabled={uploading}
                            >
                                <Paperclip size={18} color="#64748b" />
                            </button>

                            <input
                                type="text"
                                className="zalo-input-field"
                                value={messageText}
                                onChange={e => setMessageText(e.target.value)}
                                placeholder={`Nhập tin nhắn gửi tới ${selectedThreadName}...`}
                            />

                            <button
                                type="submit"
                                className="zalo-btn-primary"
                                disabled={!messageText.trim() || sending || uploading}
                                style={{ padding: '0.65rem 1.1rem', borderRadius: 20 }}
                            >
                                {(sending || uploading) ? <Loader2 className="spinner" size={16} /> : <Send size={16} />}
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* Modal Quản lý thành viên Nhóm (Admins / Creator / Members) */}
            {showGroupMembersModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                    <div style={{ background: '#fff', width: 450, borderRadius: 12, padding: '1.2rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', pb: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Users size={20} color="#0068ff" /> Thành viên nhóm {selectedThreadName}
                            </h3>
                            <button onClick={() => setShowGroupMembersModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={20} color="#64748b" />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {loadingGroupMembers ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>
                                    <Loader2 className="spinner" size={24} color="#0068ff" />
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 8 }}>Đang tải danh sách thành viên & vai trò...</p>
                                </div>
                            ) : groupMembers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.88rem' }}>
                                    Chưa có dữ liệu thành viên nhóm.
                                </div>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {groupMembers.map((m, idx) => {
                                        const uid = m.memberId || m.uid || m.userId || idx;
                                        const name = m.displayName || m.name || m.zaloName || uid;
                                        const role = m.role === 2 ? 'Trưởng nhóm' : (m.role === 1 ? 'Phó nhóm' : 'Thành viên');
                                        return (
                                            <li key={uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid #f8fafc' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                    <div className="zalo-avatar" style={{ width: 32, height: 32, fontSize: '0.85rem' }}>
                                                        {name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b' }}>{name}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>ID: {uid}</div>
                                                    </div>
                                                </div>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: 12,
                                                    background: m.role === 2 ? '#fef3c7' : (m.role === 1 ? '#e0f2fe' : '#f1f5f9'),
                                                    color: m.role === 2 ? '#b45309' : (m.role === 1 ? '#0369a1' : '#475569')
                                                }}>
                                                    {role}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Đặt biệt danh (Alias) bạn bè Zalo */}
            {showAliasModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                    <div style={{ background: '#fff', width: 380, borderRadius: 12, padding: '1.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Đặt biệt danh cho bạn bè</h3>
                            <button onClick={() => setShowAliasModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} color="#64748b" />
                            </button>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.82rem', color: '#475569', display: 'block', marginBottom: 4 }}>Biệt danh (Alias):</label>
                            <input
                                type="text"
                                className="zalo-input-field"
                                style={{ width: '100%', boxSizing: 'border-box' }}
                                value={newAliasName}
                                onChange={e => setNewAliasName(e.target.value)}
                                placeholder="Nhập tên gợi nhớ..."
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button onClick={() => setShowAliasModal(false)} className="zalo-btn-secondary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}>Hủy</button>
                            <button onClick={handleSaveAlias} disabled={savingAlias} className="zalo-btn-primary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}>
                                {savingAlias ? <Loader2 className="spinner" size={14} /> : 'Lưu biệt danh'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}