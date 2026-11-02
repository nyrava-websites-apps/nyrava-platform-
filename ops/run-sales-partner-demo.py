"""Run a synthetic Sales Partner demonstration; never load production .env files."""
import argparse,json,os,pathlib,secrets,shutil,subprocess,time
parser=argparse.ArgumentParser();parser.add_argument('--access-file');parser.add_argument('--notes-file');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];data=root/'.local-sales-demo'/secrets.token_hex(6);data.mkdir(parents=True)
password=secrets.token_urlsafe(24);billing=secrets.token_urlsafe(48);email='sales-admin@example.test'
source=root/'services/crm-lead-engine/crm-app/bin/Release/net8.0'
if not (source/'NyravaCRM.dll').exists():subprocess.run(['dotnet','build',str(root/'services/crm-lead-engine/crm-app/NyravaCRM.csproj'),'-c','Release'],check=True)
shutil.copytree(source,data/'runtime',ignore=shutil.ignore_patterns('data'))
env=os.environ.copy()
for key in list(env):
 if key.startswith(('STRIPE_','SMTP_','REDIS_','Crm__Email__')):env.pop(key)
env.update({'ASPNETCORE_ENVIRONMENT':'Development','Crm__CookieSecure':'false','ASPNETCORE_URLS':'http://127.0.0.1:15180','Database__Provider':'Sqlite','ConnectionStrings__Crm':'Data Source='+str(data/'crm.db'),'SalesPartners__Enabled':'true','SalesPartners__MeetingBaseUrl':'http://127.0.0.1:15000','Crm__BootstrapAdminEmail':email,'Crm__BootstrapAdminPassword':password,'Crm__PublicBaseUrl':'http://127.0.0.1:13000','Crm__DataProtectionPath':str(data/'keys'),'Crm__BillingSyncSecret':billing,'Crm__Email__Password':'','SMTP_PASS':''})
access=pathlib.Path(args.access_file) if args.access_file else root/'.local-sales-demo/access.json';access.parent.mkdir(parents=True,exist_ok=True);access.write_text(json.dumps({'email':email,'password':password,'billingSecret':billing,'directory':str(data)}))
if args.notes_file:pathlib.Path(args.notes_file).write_text('# Isolated Sales Partner demonstration\n\nOpen http://127.0.0.1:13000/sales-partners\n\nAdmin: '+email+'\n\nDemo-only password: '+password+'\n\nSynthetic local records only. Production unchanged.\n')
children=[];flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
try:
 children.append(subprocess.Popen(['dotnet',str(data/'runtime/NyravaCRM.dll')],cwd=root/'services/crm-lead-engine/crm-app',env=env,stdout=open(data/'crm.log','w'),stderr=subprocess.STDOUT,creationflags=flags))
 env.update({'PORT':'13000','CRM_SERVICE_URL':'http://127.0.0.1:15180','NYRAVA_DATA_DIR':str(data/'portal'),'SALES_PARTNERS_ENABLED':'true'})
 children.append(subprocess.Popen(['node','server.mjs'],cwd=root/'services/web-portal',env=env,stdout=open(data/'portal.log','w'),stderr=subprocess.STDOUT,creationflags=flags))
 if (root/'services/meet-consultation/node_modules').exists():
  meetenv=env.copy();meetenv['PORT']='15000';children.append(subprocess.Popen(['node','server.mjs'],cwd=root/'services/meet-consultation',env=meetenv,stdout=open(data/'meet.log','w'),stderr=subprocess.STDOUT,creationflags=flags))
 print('Local demo: http://127.0.0.1:13000/sales-partners; credentials: '+str(access),flush=True)
 while all(c.poll() is None for c in children):time.sleep(2)
 print('A demo service exited; inspect logs in '+str(data),flush=True)
finally:
 for child in children:child.terminate()
