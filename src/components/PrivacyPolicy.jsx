import './PrivacyPolicy.css'

const PrivacyPolicy = ({ onClose }) => {
  return (
    <div className="privacy-policy-overlay" onClick={onClose}>
      <div className="privacy-policy-content" onClick={(e) => e.stopPropagation()}>
        <div className="privacy-policy-header">
          <h2>Privacy Policy</h2>
          <button className="privacy-policy-close" onClick={onClose}>×</button>
        </div>
        <div className="privacy-policy-body">
          <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
          
          <h3>Data Storage</h3>
          <p>
            This application stores all data locally in your browser using localStorage. 
            No data is transmitted to any server or third party. All growth measurements, 
            patient information, and settings are stored exclusively on your device.
          </p>
          
          <h3>Data Export and Import</h3>
          <p>
            You can export your data as a JSON file at any time. This file contains 
            all your growth chart data and can be imported back into the application 
            or used for backup purposes. The export and import functionality operates 
            entirely on your device.
          </p>
          
          <h3>Analytics</h3>
          <p>
            This application uses Counter.dev to count the number of visits. 
            Counter.dev does not use cookies and does not collect personally identifiable information.
          </p>
          
          <h3>Third-Party Services</h3>
          <p>
            This application does not integrate with any third-party services that 
            would collect or process your data. All functionality operates entirely 
            within your browser.
          </p>
          
          <h3>Data Deletion</h3>
          <p>
            You can delete all data at any time by clearing your browser's localStorage 
            or by using the delete functions within the application. Once deleted, 
            data cannot be recovered unless you have exported it previously.
          </p>
          
          <h3>Contact</h3>
          <p>
            If you have questions about this privacy policy, please visit the 
            <a href="https://github.com/aussiedatagal/child-growth-calculator" target="_blank" rel="noopener noreferrer"> GitHub repository</a> or contact the maintainer through the repository's issues page.
          </p>
        </div>
      </div>
    </div>
  )
}

export default PrivacyPolicy

