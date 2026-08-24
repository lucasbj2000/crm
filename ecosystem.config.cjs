const path=require('path');
module.exports={apps:[{name:'crm-v23-gateway',script:path.join(__dirname,'start-vps.sh'),cwd:__dirname,interpreter:'bash',autorestart:true,max_restarts:20,restart_delay:2500,kill_timeout:6000,env:{NODE_ENV:'production'}}]};
