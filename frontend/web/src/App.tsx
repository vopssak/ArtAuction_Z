import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface ArtItem {
  id: string;
  title: string;
  artist: string;
  description: string;
  year: number;
  encryptedValue: any;
  publicValue1: number;
  publicValue2: number;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  bids: Bid[];
}

interface Bid {
  bidder: string;
  amount: number;
  timestamp: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [artItems, setArtItems] = useState<ArtItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newItemData, setNewItemData] = useState({ title: "", artist: "", description: "", year: "", reservePrice: "" });
  const [selectedItem, setSelectedItem] = useState<ArtItem | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ reservePrice: number | null }>({ reservePrice: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [topBidders, setTopBidders] = useState<{bidder: string, totalBids: number}[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM初始化失败" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const itemsList: ArtItem[] = [];
      const bidderMap: Record<string, number> = {};
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          const item: ArtItem = {
            id: businessId,
            title: businessData.name,
            artist: businessData.description,
            description: "加密艺术品",
            year: Number(businessData.publicValue1) || 0,
            encryptedValue: null,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            bids: []
          };
          
          itemsList.push(item);
          
          if (businessData.creator) {
            bidderMap[businessData.creator] = (bidderMap[businessData.creator] || 0) + 1;
          }
        } catch (e) {
          console.error('Error loading art item:', e);
        }
      }
      
      setArtItems(itemsList);
      
      const topBiddersList = Object.entries(bidderMap)
        .map(([bidder, totalBids]) => ({ bidder, totalBids }))
        .sort((a, b) => b.totalBids - a.totalBids)
        .slice(0, 5);
      setTopBidders(topBiddersList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "加载数据失败" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createArtItem = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingItem(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE创建艺术品..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("获取合约失败");
      
      const reservePrice = parseInt(newItemData.reservePrice) || 0;
      const businessId = `art-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, reservePrice);
      
      const tx = await contract.createBusinessData(
        businessId,
        newItemData.title,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newItemData.year) || 0,
        reservePrice,
        newItemData.artist
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "艺术品创建成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewItemData({ title: "", artist: "", description: "", year: "", reservePrice: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户拒绝了交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingItem(false); 
    }
  };

  const placeBid = async (itemId: string) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    const bidAmountNum = parseInt(bidAmount);
    if (isNaN(bidAmountNum) || bidAmountNum <= 0) {
      setTransactionStatus({ visible: true, status: "error", message: "请输入有效的出价金额" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return;
    }
    
    setCreatingItem(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE提交加密出价..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("获取合约失败");
      
      const businessId = `bid-${itemId}-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, bidAmountNum);
      
      const tx = await contract.createBusinessData(
        businessId,
        `出价: ${bidAmountNum}`,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        bidAmountNum,
        0,
        address
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "出价提交成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setBidAmount("");
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户拒绝了交易" 
        : "出价失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingItem(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "在链上验证解密..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "数据解密验证成功!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "解密失败: " + (e.message || "未知错误") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const filteredItems = artItems.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderProjectIntro = () => {
    return (
      <div className="project-intro">
        <div className="intro-header">
          <h2>FHE342 - 艺术品隐私拍卖</h2>
          <div className="intro-subtitle">基于全同态加密的隐私保护拍卖平台</div>
        </div>
        
        <div className="intro-content">
          <div className="intro-section">
            <h3>技术原理</h3>
            <p>使用Zama FHE技术实现加密出价，拍卖结束前所有出价金额保持加密状态，保护买家隐私。</p>
          </div>
          
          <div className="intro-section">
            <h3>工作流程</h3>
            <div className="workflow">
              <div className="workflow-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>加密出价</h4>
                  <p>买家使用FHE加密技术提交出价金额</p>
                </div>
              </div>
              <div className="workflow-arrow">→</div>
              <div className="workflow-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>链上存储</h4>
                  <p>加密数据存储在区块链上</p>
                </div>
              </div>
              <div className="workflow-arrow">→</div>
              <div className="workflow-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4>拍卖结束</h4>
                  <p>拍卖时间截止后揭示最高出价</p>
                </div>
              </div>
              <div className="workflow-arrow">→</div>
              <div className="workflow-step">
                <div className="step-number">4</div>
                <div className="step-content">
                  <h4>验证解密</h4>
                  <p>使用零知识证明验证解密结果</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="intro-section">
            <h3>核心优势</h3>
            <ul className="advantages">
              <li>保护买家身份隐私</li>
              <li>防止拍卖狙击行为</li>
              <li>确保拍卖公平透明</li>
              <li>高端艺术品安全交易</li>
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderTopBidders = () => {
    return (
      <div className="top-bidders">
        <h3>顶级买家排行榜</h3>
        <div className="bidders-list">
          {topBidders.map((bidder, index) => (
            <div className="bidder-item" key={index}>
              <div className="bidder-rank">{index + 1}</div>
              <div className="bidder-info">
                <div className="bidder-address">{bidder.bidder.substring(0, 6)}...{bidder.bidder.substring(38)}</div>
                <div className="bidder-stats">出价次数: {bidder.totalBids}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFooter = () => {
    return (
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>关于我们</h4>
            <p>FHE342是一个基于全同态加密技术的艺术品隐私拍卖平台，致力于保护藏家隐私和拍卖公平性。</p>
          </div>
          
          <div className="footer-section">
            <h4>技术合作伙伴</h4>
            <div className="partners">
              <div className="partner">Zama</div>
              <div className="partner">FHEVM</div>
              <div className="partner">RainbowKit</div>
            </div>
          </div>
          
          <div className="footer-section">
            <h4>法律声明</h4>
            <p>本平台所有交易均基于区块链技术，艺术品真伪由卖家保证，平台不承担鉴定责任。</p>
          </div>
        </div>
        
        <div className="copyright">
          © 2023 FHE342 艺术品隐私拍卖平台 | 基于全同态加密技术
        </div>
      </footer>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE342 🔐</h1>
            <div className="logo-subtitle">艺术品隐私拍卖</div>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🖼️</div>
            <h2>连接钱包继续</h2>
            <p>请连接您的钱包以访问加密艺术品拍卖平台。</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>使用上方按钮连接钱包</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE系统将自动初始化</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>开始浏览和竞拍加密艺术品</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>初始化FHE加密系统...</p>
        <p>状态: {fhevmInitializing ? "初始化FHEVM" : status}</p>
        <p className="loading-note">这可能需要一些时间</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>加载加密拍卖系统...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE342 🔐</h1>
          <div className="logo-subtitle">艺术品隐私拍卖</div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + 添加艺术品
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="left-panel">
          {renderProjectIntro()}
          {renderTopBidders()}
        </div>
        
        <div className="right-panel">
          <div className="auction-section">
            <div className="section-header">
              <h2>拍卖艺术品</h2>
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="搜索艺术品..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button 
                  onClick={loadData} 
                  className="refresh-btn" 
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "刷新中..." : "刷新"}
                </button>
              </div>
            </div>
            
            <div className="art-items-grid">
              {filteredItems.length === 0 ? (
                <div className="no-items">
                  <p>未找到艺术品</p>
                  <button 
                    className="create-btn" 
                    onClick={() => setShowCreateModal(true)}
                  >
                    添加第一件艺术品
                  </button>
                </div>
              ) : filteredItems.map((item, index) => (
                <div 
                  className={`art-item ${selectedItem?.id === item.id ? "selected" : ""}`} 
                  key={index}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="art-image-placeholder"></div>
                  <div className="art-details">
                    <div className="art-title">{item.title}</div>
                    <div className="art-artist">{item.artist}</div>
                    <div className="art-year">{item.year}</div>
                    <div className="art-status">
                      {item.isVerified ? "✅ 已验证" : "🔓 待验证"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateArtItem 
          onSubmit={createArtItem} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingItem} 
          itemData={newItemData} 
          setItemData={setNewItemData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedItem && (
        <ArtDetailModal 
          item={selectedItem} 
          onClose={() => { 
            setSelectedItem(null); 
            setDecryptedData({ reservePrice: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedItem.id)}
          bidAmount={bidAmount}
          setBidAmount={setBidAmount}
          placeBid={() => placeBid(selectedItem.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      {renderFooter()}
    </div>
  );
};

const ModalCreateArtItem: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  itemData: any;
  setItemData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, itemData, setItemData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setItemData({ ...itemData, [name]: value });
  };

  return (
    <div className="modal-overlay">
      <div className="create-art-modal">
        <div className="modal-header">
          <h2>添加新艺术品</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 加密</strong>
            <p>保留价将使用Zama FHE加密（仅限整数）</p>
          </div>
          
          <div className="form-group">
            <label>艺术品名称 *</label>
            <input 
              type="text" 
              name="title" 
              value={itemData.title} 
              onChange={handleChange} 
              placeholder="输入艺术品名称..." 
            />
          </div>
          
          <div className="form-group">
            <label>艺术家 *</label>
            <input 
              type="text" 
              name="artist" 
              value={itemData.artist} 
              onChange={handleChange} 
              placeholder="输入艺术家姓名..." 
            />
          </div>
          
          <div className="form-group">
            <label>创作年份 *</label>
            <input 
              type="number" 
              name="year" 
              value={itemData.year} 
              onChange={handleChange} 
              placeholder="输入创作年份..." 
            />
          </div>
          
          <div className="form-group">
            <label>描述</label>
            <textarea 
              name="description" 
              value={itemData.description} 
              onChange={handleChange} 
              placeholder="输入艺术品描述..." 
            />
          </div>
          
          <div className="form-group">
            <label>保留价 (整数) *</label>
            <input 
              type="number" 
              name="reservePrice" 
              value={itemData.reservePrice} 
              onChange={handleChange} 
              placeholder="输入保留价..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE加密整数</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !itemData.title || !itemData.artist || !itemData.year || !itemData.reservePrice} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "加密并创建中..." : "创建艺术品"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ArtDetailModal: React.FC<{
  item: ArtItem;
  onClose: () => void;
  decryptedData: { reservePrice: number | null };
  setDecryptedData: (value: { reservePrice: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  bidAmount: string;
  setBidAmount: (value: string) => void;
  placeBid: () => void;
}> = ({ item, onClose, decryptedData, setDecryptedData, isDecrypting, decryptData, bidAmount, setBidAmount, placeBid }) => {
  const handleDecrypt = async () => {
    if (decryptedData.reservePrice !== null) { 
      setDecryptedData({ reservePrice: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedData({ reservePrice: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="art-detail-modal">
        <div className="modal-header">
          <h2>艺术品详情</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="art-info">
            <div className="art-image-large"></div>
            <div className="art-details">
              <div className="detail-item">
                <span>名称:</span>
                <strong>{item.title}</strong>
              </div>
              <div className="detail-item">
                <span>艺术家:</span>
                <strong>{item.artist}</strong>
              </div>
              <div className="detail-item">
                <span>创作年份:</span>
                <strong>{item.year}</strong>
              </div>
              <div className="detail-item">
                <span>创建者:</span>
                <strong>{item.creator.substring(0, 6)}...{item.creator.substring(38)}</strong>
              </div>
              <div className="detail-item">
                <span>创建时间:</span>
                <strong>{new Date(item.timestamp * 1000).toLocaleString()}</strong>
              </div>
            </div>
          </div>
          
          <div className="data-section">
            <h3>加密拍卖数据</h3>
            
            <div className="data-row">
              <div className="data-label">保留价:</div>
              <div className="data-value">
                {item.isVerified && item.decryptedValue ? 
                  `${item.decryptedValue} (链上已验证)` : 
                  decryptedData.reservePrice !== null ? 
                  `${decryptedData.reservePrice} (本地解密)` : 
                  "🔒 FHE加密整数"
                }
              </div>
              <button 
                className={`decrypt-btn ${(item.isVerified || decryptedData.reservePrice !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 验证中..."
                ) : item.isVerified ? (
                  "✅ 已验证"
                ) : decryptedData.reservePrice !== null ? (
                  "🔄 重新验证"
                ) : (
                  "🔓 验证解密"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 自中继解密</strong>
                <p>数据在链上加密。点击"验证解密"执行离线解密并使用FHE.checkSignatures进行链上验证。</p>
              </div>
            </div>
          </div>
          
          <div className="bid-section">
            <h3>提交加密出价</h3>
            <div className="bid-form">
              <input 
                type="number" 
                value={bidAmount} 
                onChange={(e) => setBidAmount(e.target.value)} 
                placeholder="输入出价金额..." 
                min="1"
              />
              <button onClick={placeBid} className="bid-btn">提交加密出价</button>
            </div>
            <div className="bid-notice">
              <p>您的出价金额将使用FHE技术加密，直到拍卖结束才会揭示。</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">关闭</button>
          {!item.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "链上验证中..." : "链上验证"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

