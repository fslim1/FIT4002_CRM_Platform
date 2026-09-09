import client from './client'

export const fetchDashboardData = async (memberId = '', timeFilter = 'thisMonth', customStartDate = '', customEndDate = '') => {
    const params = new URLSearchParams();
    if (memberId) params.append('memberId', memberId);
    if (timeFilter) params.append('timeFilter', timeFilter);
    if (timeFilter === 'custom') {
        if (customStartDate) params.append('startDate', customStartDate);
        if (customEndDate) params.append('endDate', customEndDate);
    }
    const url = `/dashboard?${params.toString()}`;
    const {data} = await client.get(url)
    return data
}
