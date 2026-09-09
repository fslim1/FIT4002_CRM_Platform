import React from 'react';
import { GmailLinker } from '../components/GmailLinker';

export default function Settings() {

  return (
    // <div style={{ padding: '30px', color: '#ffffff' }}>
    //   <h2>Settings</h2>
    //   <p style={{ color: '#aaa', marginBottom: '30px' }}>
    //     Manage your CRM preferences and integrations.
    //   </p>

    //   <div style={{ 
    //     backgroundColor: 'rgba(255, 255, 255, 0.05)', 
    //     borderRadius: '12px', 
    //     padding: '24px', 
    //     maxWidth: '500px',
    //     border: '1px solid rgba(255, 255, 255, 0.1)'
    //   }}>
    //     <h3 style={{ marginTop: 0 }}>Email Integration</h3>
    //     <p style={{ fontSize: '0.9rem', color: '#ccc' }}>
    //       Connect your Gmail account to allow sending emails directly from customer profiles.
    //     </p>

    //     <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    //       <div>
    //         <strong>Status: </strong>
    //         <span style={{ color: isConnected ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
    //           {isConnected ? 'Connected' : 'Not Connected'}
    //         </span>
    //       </div>

    //       {!isConnected ? (
    //         <button 
    //           onClick={handleLinkGmail} 
    //           style={{
    //             backgroundColor: '#4285F4',
    //             color: '#fff',
    //             border: 'none',
    //             padding: '10px 16px',
    //             borderRadius: '6px',
    //             cursor: 'pointer',
    //             fontWeight: 'bold'
    //           }}
    //         >
    //           🔗 Connect Sandbox Gmail
    //         </button>
    //       ) : (
    //         <button 
    //           onClick={handleDisconnect} 
    //           style={{
    //             backgroundColor: 'transparent',
    //             color: '#ff4d4f',
    //             border: '1px solid #ff4d4f',
    //             padding: '8px 14px',
    //             borderRadius: '6px',
    //             cursor: 'pointer'
    //           }}
    //         >
    //           Disconnect
    //         </button>
    //       )}
    //     </div>
    //   </div>
    // </div>
    <div className="settings-page" style={{ padding: '30px', color: '#fff' }}>
      <h2>Settings</h2>

      {/* Email Integration Section */}
      <section className="settings-section" style={{ marginBottom: '30px' }}>
        <h3>Email Integration</h3>
        <p>Connect your Gmail account to dispatch emails directly from customer profiles.</p>
        <GmailLinker />
      </section>

      {/* Future sections will easily fit here cleanly */}
      {/* <section className="settings-section">
            <h3>Profile Settings</h3>
            <UserProfileForm />
          </section> 
      */}
    </div>
  );
}