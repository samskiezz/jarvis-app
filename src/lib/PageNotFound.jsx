import { useLocation } from 'react-router-dom';
import { kimiClient } from '@/api/kimiClient';
import { useQuery } from '@tanstack/react-query';


export default function PageNotFound({}) {
    const location = useLocation();
    const pageName = location.pathname.substring(1);

    const { data: authData, isFetched } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            try {
                const user = await kimiClient.auth.me();
                return { user, isAuthenticated: true };
            } catch (error) {
                return { user: null, isAuthenticated: false };
            }
        }
    });
    
    return (
        <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'#020509',fontFamily:"'JetBrains Mono',Courier New,monospace" }}>
            <div style={{ maxWidth:400,width:'100%',textAlign:'center' }}>
                <div style={{ fontSize:64,fontWeight:200,color:'rgba(0,200,120,0.15)',letterSpacing:8,marginBottom:16 }}>404</div>
                <div style={{ height:1,width:48,background:'rgba(0,200,120,0.2)',margin:'0 auto 24px' }}/>
                <h2 style={{ fontSize:16,color:'#a8bcc8',fontWeight:500,marginBottom:12,letterSpacing:2 }}>PAGE NOT FOUND</h2>
                <p style={{ fontSize:11,color:'#566878',lineHeight:1.8,marginBottom:24 }}>
                    The page <span style={{ color:'#00c878' }}>"{pageName}"</span> could not be found.
                </p>
                {isFetched && authData.isAuthenticated && authData.user?.role === 'admin' && (
                    <div style={{ padding:'12px 16px',background:'rgba(0,200,120,0.04)',border:'1px solid rgba(0,200,120,0.14)',borderRadius:4,marginBottom:24,textAlign:'left' }}>
                        <p style={{ fontSize:9,color:'#00c878',letterSpacing:2,marginBottom:6 }}>ADMIN NOTE</p>
                        <p style={{ fontSize:10,color:'#566878',lineHeight:1.6 }}>This page hasn't been implemented yet. Ask the AI to build it in the chat.</p>
                    </div>
                )}
                <button onClick={() => window.location.href = '/'}
                    style={{ background:'rgba(0,200,120,0.08)',border:'1px solid rgba(0,200,120,0.25)',color:'#00c878',padding:'8px 20px',borderRadius:4,cursor:'pointer',fontSize:10,letterSpacing:2,fontFamily:'inherit' }}>
                    ← RETURN TO TERMINAL
                </button>
            </div>
        </div>
    )
}