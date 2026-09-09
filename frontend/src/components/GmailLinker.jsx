import React, { useState, useEffect } from 'react';

export const GmailLinker = () => {
  const [tokenClient, setTokenClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check if token already exists in localStorage
    const existingToken = localStorage.getItem('google_access_token');
    if (existingToken) {
      setIsConnected(true);
    }

    // Access Vite environment variables correctly
    const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error("Google Client ID is missing from environment variables.");
      return;
    }

    if (window.google) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        callback: (tokenResponse) => {
          if (tokenResponse.access_token) {
            window.localStorage.setItem('google_access_token', tokenResponse.access_token);
            setIsConnected(true);
            console.log('Gmail successfully connected!');
          }
        },
      });
      setTokenClient(client);
    }
  }, []);

  const handleLinkGmail = () => {
    if (tokenClient) {
      tokenClient.requestAccessToken();
    } else {
      console.log("Google script is still loading or window.google is not available. Please refresh.");
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('google_access_token');
    setIsConnected(false);
    console.log('Gmail account disconnected.');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '15px' }}>
      <div>
        <strong>Status: </strong>
        <span style={{ color: isConnected ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
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