package fr.meteo74.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** User-initiated updater. No arbitrary URL, silent install, or JavaScript bridge. */
final class AppUpdater {
    static final int INSTALL_PERMISSION_REQUEST=75;
    private final Activity activity;
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private volatile boolean busy=false,cancelled=false,closed=false;
    private volatile HttpURLConnection connection;
    private AlertDialog dialog;
    private File readyApk;
    private JSONObject readyRelease;
    AppUpdater(Activity activity){this.activity=activity;}
    private void ui(Runnable action){activity.runOnUiThread(()->{if(!closed&&!activity.isFinishing())action.run();});}
    private void dismiss(){if(dialog!=null){dialog.dismiss();dialog=null;}}
    private void error(String message){ui(()->{dismiss();new AlertDialog.Builder(activity).setTitle("Mise à jour Météo74").setMessage(message).setPositiveButton("Fermer",null).show();});}
    void check(){
        if(busy)return;busy=true;cancelled=false;
        dialog=new AlertDialog.Builder(activity).setTitle("Mise à jour Météo74").setMessage("Recherche d’une nouvelle version…").setNegativeButton("Annuler",(d,w)->cancel()).setCancelable(false).show();
        executor.execute(()->{try{
            HttpURLConnection c=open("latest.json",0);if(c.getResponseCode()!=200)throw new IOException("Le service de mise à jour est momentanément indisponible.");
            String json;try(InputStream in=c.getInputStream()){json=new String(readBounded(in,65536),StandardCharsets.UTF_8);}finally{c.disconnect();}
            JSONObject release=new JSONObject(json);validateRelease(release);if(cancelled)return;
            int code=release.getInt("versionCode");ui(()->{dismiss();if(code<=UpdateConfig.VERSION_CODE){new AlertDialog.Builder(activity).setTitle("Application à jour").setMessage("Météo74 "+UpdateConfig.VERSION_NAME+" est la dernière version disponible.").setPositiveButton("OK",null).show();}else{
                String message="Version "+release.optString("versionName")+" · "+String.format(Locale.FRANCE,"%.1f Mo",release.optLong("size")/1000000.0)+"\n\n"+release.optString("notes","");
                new AlertDialog.Builder(activity).setTitle("Nouvelle version disponible").setMessage(message).setNegativeButton("Plus tard",null).setPositiveButton("Télécharger",(d,w)->download(release)).show();
            }});
        }catch(Exception e){if(!cancelled)error(message(e));}finally{busy=false;connection=null;}});
    }
    private void validateRelease(JSONObject r)throws Exception{
        if(!activity.getPackageName().equals(r.getString("packageName"))||r.getInt("versionCode")<1||r.getLong("size")<10000||r.getLong("size")>50_000_000||!r.getString("sha256").matches("[0-9a-f]{64}")||!r.getString("file").matches("Meteo74-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk"))throw new IOException("La description de cette mise à jour est invalide.");
    }
    private HttpURLConnection open(String file,long offset)throws IOException{
        URL url=new URL(UpdateConfig.BASE_URL+"/"+file);HttpURLConnection c=(HttpURLConnection)url.openConnection();connection=c;
        c.setConnectTimeout(15000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);c.setUseCaches(false);
        c.setRequestProperty("Authorization","Bearer "+UpdateConfig.ANON_KEY);c.setRequestProperty("apikey",UpdateConfig.ANON_KEY);c.setRequestProperty("Accept-Encoding","identity");
        if(offset>0)c.setRequestProperty("Range","bytes="+offset+"-");return c;
    }
    private void download(JSONObject release){
        if(busy)return;busy=true;cancelled=false;readyApk=null;readyRelease=null;
        LinearLayout box=new LinearLayout(activity);box.setOrientation(LinearLayout.VERTICAL);int pad=(int)(24*activity.getResources().getDisplayMetrics().density);box.setPadding(pad,pad,pad,pad);
        TextView label=new TextView(activity);label.setText("Connexion…");label.setTextSize(15);box.addView(label);
        ProgressBar progress=new ProgressBar(activity,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(100);progress.setIndeterminate(true);box.addView(progress,new LinearLayout.LayoutParams(-1,-2));
        dialog=new AlertDialog.Builder(activity).setTitle("Téléchargement de Météo74").setView(box).setNegativeButton("Annuler",(d,w)->cancel()).setCancelable(false).show();
        executor.execute(()->{try{
            validateRelease(release);File folder=new File(activity.getFilesDir(),"updates");if(!folder.exists()&&!folder.mkdirs())throw new IOException("Espace de stockage indisponible.");
            File part=new File(folder,release.getString("file")+".part"),target=new File(folder,release.getString("file"));long expected=release.getLong("size");
            if(part.length()>expected)part.delete();
            for(int attempt=0;attempt<3;attempt++){
                if(cancelled)return;
                try{
                    long offset=part.exists()?part.length():0;
                    if(offset<expected){HttpURLConnection c=open(release.getString("file"),offset);int status=c.getResponseCode();
                        if(status==200)offset=0;else if(status!=206||!String.valueOf(c.getHeaderField("Content-Range")).startsWith("bytes "+offset+"-"))throw new IOException("Le téléchargement n’a pas pu démarrer.");
                        long loaded=offset,lastProgress=0;
                        try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(part,offset>0)){
                            byte[] buffer=new byte[32768];int n;
                            while((n=in.read(buffer))!=-1){if(cancelled)return;loaded+=n;if(loaded>expected)throw new IOException("Taille du fichier inattendue.");out.write(buffer,0,n);
                                if(System.currentTimeMillis()-lastProgress>150||loaded==expected){int percent=(int)(loaded*100/expected);long downloaded=loaded;ui(()->{progress.setIndeterminate(false);progress.setProgress(percent);label.setText(percent+" % · "+String.format(Locale.FRANCE,"%.1f / %.1f Mo",downloaded/1000000.0,expected/1000000.0));});lastProgress=System.currentTimeMillis();}
                            }
                        }finally{c.disconnect();}
                    }
                    if(part.length()!=expected)throw new IOException("Connexion interrompue. Le téléchargement pourra reprendre.");break;
                }catch(IOException e){if(cancelled)return;if(attempt==2)throw e;ui(()->label.setText("Connexion interrompue · reprise du téléchargement…"));}
            }
            if(cancelled)return;ui(()->{progress.setIndeterminate(true);label.setText("Vérification du fichier et de sa signature…");});
            if(!digest(part).equals(release.getString("sha256"))){part.delete();throw new IOException("Le fichier reçu est incomplet ou altéré. Relancez le téléchargement.");}
            verifyApk(part,release.getInt("versionCode"));if(target.exists()&&!target.delete())throw new IOException("Impossible de remplacer le fichier téléchargé.");
            if(!part.renameTo(target))throw new IOException("Impossible de préparer l’installation.");readyApk=target;readyRelease=release;if(cancelled)return;
            ui(()->{dismiss();install();});
        }catch(Exception e){if(!cancelled)error(message(e));}finally{busy=false;connection=null;}});
    }
    private void verifyApk(File apk,int expectedCode)throws Exception{
        int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
        PackageManager pm=activity.getPackageManager();PackageInfo downloaded=pm.getPackageArchiveInfo(apk.getAbsolutePath(),flags),current=pm.getPackageInfo(activity.getPackageName(),flags);
        if(downloaded==null||!activity.getPackageName().equals(downloaded.packageName))throw new IOException("Le fichier ne correspond pas à Météo74.");
        long code=Build.VERSION.SDK_INT>=28?downloaded.getLongVersionCode():downloaded.versionCode;
        if(code!=expectedCode||code<=UpdateConfig.VERSION_CODE)throw new IOException("Cette version ne peut pas remplacer l’application.");
        if(!signatures(downloaded).equals(signatures(current))||signatures(current).isEmpty())throw new IOException("La signature de la mise à jour n’est pas celle de Météo74.");
    }
    private Set<String> signatures(PackageInfo info)throws Exception{
        Signature[] certs=Build.VERSION.SDK_INT>=28?(info.signingInfo==null?null:info.signingInfo.getApkContentsSigners()):info.signatures;Set<String> result=new HashSet<>();
        if(certs!=null)for(Signature cert:certs)result.add(hex(MessageDigest.getInstance("SHA-256").digest(cert.toByteArray())));return result;
    }
    private void install(){
        if(readyApk==null||!readyApk.isFile())return;
        if(Build.VERSION.SDK_INT>=26&&!activity.getPackageManager().canRequestPackageInstalls()){
            new AlertDialog.Builder(activity).setTitle("Autorisation Android").setMessage("Android demande d’autoriser Météo74 à installer ses mises à jour. Activez l’autorisation puis revenez dans l’application : le fichier est déjà téléchargé.").setNegativeButton("Plus tard",null).setPositiveButton("Ouvrir les paramètres",(d,w)->{
                try{activity.startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())),INSTALL_PERMISSION_REQUEST);}catch(Exception e){error("Ouvrez les paramètres Android pour autoriser les mises à jour de Météo74.");}
            }).show();return;
        }
        try{Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".updates",readyApk);Intent i=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);activity.startActivity(i);}catch(Exception e){error("L’installateur Android n’a pas pu être ouvert. Réessayez depuis Mise à jour.");}
    }
    void resumeInstallation(){if(Build.VERSION.SDK_INT<26||activity.getPackageManager().canRequestPackageInstalls())install();}
    private void cancel(){cancelled=true;HttpURLConnection c=connection;if(c!=null)c.disconnect();}
    void close(){closed=true;cancel();dismiss();executor.shutdownNow();}
    private static String message(Exception e){if(e instanceof SocketTimeoutException)return "La connexion prend trop de temps. Vérifiez le réseau puis réessayez.";return e.getMessage()==null?"La mise à jour est indisponible. Réessayez dans quelques instants.":e.getMessage();}
    private static byte[] readBounded(InputStream in,int max)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>max)throw new IOException("Réponse du serveur trop longue.");out.write(b,0,n);}return out.toByteArray();}
    private static String digest(File f)throws Exception{MessageDigest d=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(f)){byte[] b=new byte[32768];int n;while((n=in.read(b))!=-1)d.update(b,0,n);}return hex(d.digest());}
    private static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format(Locale.ROOT,"%02x",x&255));return s.toString();}
}
