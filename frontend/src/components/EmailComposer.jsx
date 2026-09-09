import React, { useEffect, useState } from 'react';
import { FiX, FiSend, FiAlertCircle } from "react-icons/fi";
import api from '../api/client';

export function EmailComposer({ customerEmail, customerId, onClose, onEmailSent }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      setErrorMsg("Please fill out both the subject and message fields.");
      return;
    }

    const accessToken = window.localStorage.getItem('google_access_token') || 
                        window.sessionStorage.getItem('accessToken');

    if (!accessToken) {
      setErrorMsg("Google authentication required to send emails. Please link your account in Settings.");
      return;
    }

    setIsSending(true);

    // This is where you would call your Django API later
    const payload = {
      type: "Email",
      details: message, 
      emailSubject: subject || "CRM Update",
      customerEmail: customerEmail,
      googleAccessToken: accessToken
    };
    
    try {
      await api.post(`/customers/${customerId}/interactions`, payload);
      
      if (onEmailSent) {
        onEmailSent();
      }
      
      setSubject("");
      setMessage("");
      onClose();
      
      console.log("Email sent and interaction logged successfully!");
    } catch (err) {
      console.error("Failed to execute live email pipeline:", err);
      setErrorMsg(err.response?.data?.message || "Could not dispatch email. Ensure your Google account is linked.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="side-panel"> 
      <div className="side-panel-header">
        <h4>Compose Email</h4>
        <button onClick={onClose} className="close-btn"><FiX /></button>
      </div>

      <div className="side-panel-body">
        {errorMsg && (
          <div className="error-message">
            <FiAlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}
        <div className="side-panel-row">
          <span className="detail-label">To:</span>
          <span>{customerEmail}</span>
        </div>
        
        <div className="side-panel-row" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
          <span className="detail-label">Subject:</span>
          <input 
            type="text" 
            className="edit-input" 
            style={{width: '100%', marginTop: '5px'}}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isSending}
            placeholder="Enter email subject..."
          />
        </div>

        <div style={{ marginTop: '15px' }}>
          <span className="detail-label">Message:</span>
          <textarea 
            className="edit-textarea"
            style={{minHeight: '150px'}}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isSending}
            placeholder="Type your email message here..."
          />
        </div>
      </div>

      <div className="side-panel-footer">
        <button className="cancel-btn" onClick={onClose}>Cancel</button>
        <button className="save-btn" onClick={handleSend}>
          <FiSend size={14}/> {"Send Email"}
        </button>
      </div>
    </div>
  );
}

export default EmailComposer;