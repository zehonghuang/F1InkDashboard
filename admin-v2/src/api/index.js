export * from '@/api/http';
export * from '@/api/admin';
export * from '@/api/mpNews';
import { fetchMpNewsList, ingestMpNews } from '@/api/mpNews';
import { fetchAdminDevices, fetchAdminUsers, fetchAdminF1LiveTiming, adminBind, adminUnbind, fetchAdminMotorsportLiveStandings } from '@/api/admin';
export async function fetchDashboardSummary(timezone) {
    const [news, devices, users, live] = await Promise.all([
        fetchMpNewsList({ page: 1, pageSize: 5, tz: timezone }),
        fetchAdminDevices({ page: 1, pageSize: 5 }),
        fetchAdminUsers({ page: 1, pageSize: 5 }),
        fetchAdminF1LiveTiming(),
    ]);
    return {
        newsTotal: news.total || 0,
        deviceTotal: devices.total || 0,
        userTotal: users.total || 0,
        liveConnected: Boolean(live.status?.connected),
        liveRows: live.status?.rows?.length || 0,
        latestNews: news.items || [],
        latestDevices: devices.items || [],
        latestUsers: users.items || [],
    };
}
export const bindUserDevice = adminBind;
export const unbindUserDevice = adminUnbind;
export const saveMpNews = ingestMpNews;
export const fetchLiveStandings = fetchAdminMotorsportLiveStandings;
export const fetchF1LiveTiming = fetchAdminF1LiveTiming;
