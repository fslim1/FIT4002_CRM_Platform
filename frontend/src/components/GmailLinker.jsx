import {useState, useEffect} from 'react';
import {requestGmailToken} from '@/api/gmailToken';

export const GmailLinker = () => {
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const existingToken = localStorage.getItem('google_access_token');
        if (existingToken) {
            setIsConnected(true);
        }
    }, []);

    const handleLinkGmail = async () => {
        try {
            const token = await requestGmailToken({forceConsent: true});
            localStorage.setItem('google_access_token', token);
            setIsConnected(true);
            console.log('Gmail successfully connected!');
        } catch (error) {
            console.error('Gmail link failed:', error);
        }
    };

    const handleDisconnect = () => {
        localStorage.removeItem('google_access_token');
        setIsConnected(false);
        console.log('Gmail account disconnected.');
    };

    return (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '15px'}}>
            <div>
                <strong>Status: </strong>
                <span style={{color: isConnected ? '#4caf50' : '#f44336', fontWeight: 'bold'}}>
          {isConnected ? 'Connected' : 'Not Connected'}
        </span>
            </div>

            {!isConnected ? (
                <button onClick={handleLinkGmail} className="btn-gmail">
                    🔗 Connect Gmail
                </button>
            ) : (
                <button onClick={handleDisconnect} className="btn-disconnect">
                    Disconnect
                </button>
            )}
        </div>
    );
};