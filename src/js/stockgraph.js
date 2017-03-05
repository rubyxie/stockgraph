/*
 * created by bigbird on 2017/2/26
 */
(function(){
	var KPainter,requestDispatcher,pageControl;
	/*
	 * K线绘图器。本身作为总控制器，内部有多个绘图器
	 */
	KPainter=(function(){
		//dom元素
		var container,realCanvas,cacheCanvas,realContext,cacheContext;
		//配置变量
		var rawData,process,speed,totalTime,painterStack,kColor,kWidth,gapWidth,
			fontSize,showCursor,maColor;
		//方法&对象
		var init,draw,resize,refreshCache,candlePainter,barPainter,
			kControl,trendControl,textPainter,trendPainter,initDom,initCanvas,
			animate,painterTool,bindListener,currControl;

		//初始化dom元素，仅需执行一次
		initDom=function(){
			//固定配置项
			painterStack=[];
			//[跌，涨]
			kColor=["#32a647","#fa5d5d"];
			maColor={5:"#f5a623",10:"#2e84e6",20:"#bd10e0"};
			fontSize=24;
			totalTime=800;
			speed=16/totalTime;
			process=speed;
			//dom
			container=document.getElementById("k-container");
			realCanvas=container.realCanvas || document.createElement("canvas");
			cacheCanvas=container.cacheCanvas || document.createElement("canvas");
			realContext=realCanvas.getContext("2d");
			cacheContext=cacheCanvas.getContext("2d");
			container.appendChild(realCanvas);
		};
		
		//初始化画布长宽，在页面resize时需要重新执行
		initCanvas=function(){
			//避免移动设备screenPixel模糊问题
			cacheCanvas.width=container.clientWidth*2;
			cacheCanvas.height=container.clientHeight*2;
			realCanvas.width=container.clientWidth*2;
			realCanvas.height=container.clientHeight*2;
			realCanvas.style.width=container.clientWidth+"px";
			realCanvas.style.height=container.clientHeight+"px";
		};

		/*------------------------工具方法---------------------------*/
		painterTool={
			//传入两个坐标点对象，绘制连接这两个点的虚线
			drawDashed:function(start,end){
				var gap=0.004,length=0.006,position=0,x,y,
					gapX,gapY,lengthX,lengthY,step;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#ccc";
				cacheContext.lineWidth=2;
				gapX=(end.x-start.x)*gap;
				gapY=(end.y-start.y)*gap;
				lengthX=(end.x-start.x)*length;
				lengthY=(end.y-start.y)*length;
				step=gap+length;
				x=start.x;
				y=start.y;
				cacheContext.moveTo(x,y);
				for(;position+length<1;position+=step){
					x+=lengthX;
					y+=lengthY;
					cacheContext.lineTo(x,y);
					x+=gapX;
					y+=gapY;
					cacheContext.moveTo(x,y);
				}
				cacheContext.lineTo(end.x,end.y);
				cacheContext.stroke();
			},
			//数字为参数，返回奇数
			getOdd:function(value){
				return value%2==0 ? value+1:value;
			}
		};

		/*------------------------工具方法end---------------------------*/

		/*------------------------绘图器---------------------------*/
		/*
		 * K线蜡烛绘图器，子绘图器操作在缓冲画布中，不影响显示
		 */
		candlePainter=(function(){
			//配置变量
			var data,layout,width,height,leftX,rightX,topY,bottomY,
				max,min,candleY,candleX,amount,gapOccupy,range,middleX,
				middleY,start,end;
			//方法
			var initSize,drawReady,resizeDraw,initValue,drawGrid,handleData,
				drawFrame,drawUpCandle,drawDownCandle,calcAxis,insideOf,drawMA;

			//为固定配置变量赋值
			layout={a:0.01,b:0.01,c:0.3,d:0.01};
			gapOccupy=0.4;

			//设置布局属性，画布长宽会在resize时重新计算
			initValue=function(){
				width=realCanvas.width*(1-layout.b-layout.d);
				height=realCanvas.height*(1-layout.a-layout.c);
				leftX=realCanvas.width*layout.d;
				rightX=leftX+width;
				topY=realCanvas.height*layout.a;
				bottomY=topY+height;
			};

			//计算y坐标值
			calcAxis=function(){
				var i,j,k;
				for(i=start;i<end;i++){
					//蜡烛坐标计算，[开盘价，最高价，最低价，收盘价，中点]y坐标
					data[i].axis=[];
					for(j=1;j<5;j++){
						data[i].axis.push(topY+height*(max-data[i][j])/range);
					}
					data[i].axis.push((data[i].axis[3]+data[i].axis[0])/2);
					for(k in data.maData){
						data.maData[k][i].maAxis=topY+height*(max-data.maData[k][i][0])/range;
					}
				}
			};

			/*
			 * 为可变配置赋值
			 * 计算数据展示总数
			 * 计算蜡烛宽度、间距宽度
			 * 计算y坐标轴的最大值，最小值
			 * 计算每个数据的颜色标记：1-涨，0-跌
			 */
			handleData=function(){
				var i,j,b,e;
				amount=end-start;
				kWidth=width*(1-gapOccupy)/amount;
				gapWidth=width*gapOccupy/(amount+1);
				//处理ma头尾补图形引起的作用于变化问题
				max=data[start][2];
				min=data[start][3];
				if(start>0){
					b=start-1;
				}else{
					b=start;
				}
				if(end<data.length){
					e=end+1;
				}else{
					e=end;
				}
				for(i=b;i<e;i++){
					if(max<data[i][2]){
						max=data[i][2];
					}
					for(j in data.maData){
						if(max<data.maData[j][i][0]){
							max=data.maData[j][i][0];
						}
					}
					if(min>data[i][3]){
						min=data[i][3];
					}
					for(j in data.maData){
						if(min>data.maData[j][i][0]){
							min=data.maData[j][i][0];
						}
					}
				}
				range=max-min;
				calcAxis();
			};
			
			//绘制坐标轴网格
			drawGrid=function(){
				var stepY;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#000";
				cacheContext.lineWidth=1;
				//绘制实线
				cacheContext.moveTo(painterTool.getOdd(leftX),painterTool.getOdd(topY));
				cacheContext.lineTo(painterTool.getOdd(rightX),painterTool.getOdd(topY));
				cacheContext.lineTo(painterTool.getOdd(rightX),painterTool.getOdd(bottomY));
				cacheContext.lineTo(painterTool.getOdd(leftX),painterTool.getOdd(bottomY));
				cacheContext.closePath();
				cacheContext.stroke();
				//绘制虚线
				stepY=height/4;
				for(var i=1;i<4;i++){
					painterTool.drawDashed({x:painterTool.getOdd(leftX),y:painterTool.getOdd(topY+i*stepY)},{x:painterTool.getOdd(rightX),y:painterTool.getOdd(topY+i*stepY)});
				}
				//绘制y轴数字
				cacheContext.fillStyle="#999";
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillText(max.toFixed(2),leftX,topY);
				cacheContext.textBaseline="middle";
				cacheContext.fillText(((max+min)/2).toFixed(2),leftX,topY+height/2);
				cacheContext.textBaseline="bottom";
				cacheContext.fillText(min.toFixed(2),leftX,bottomY);
				//绘制x轴日期
				cacheContext.textBaseline="top";
				cacheContext.fillText(data[0][0],leftX,bottomY);
				cacheContext.textAlign="right";
				cacheContext.fillText(data[data.length-1][0],rightX,bottomY);
			};

			/*
			 * 红色K线，从下往上画
			 * 传入蜡烛左侧x坐标和K线数据[日期，开盘价，最高价，最低价，收盘价，成交量]为参数
			 */
			drawUpCandle=function(x,value){
				middleX=painterTool.getOdd(x+kWidth/2);
				middleY=value.axis[4];
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[value.color];
				cacheContext.strokeStyle=kColor[value.color];
				cacheContext.lineWidth=2;
				candleY=middleY+(value.axis[0]-middleY)*process;
				cacheContext.moveTo(x,candleY);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.moveTo(middleX,middleY+(value.axis[2]-middleY)*process);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.lineTo(x+kWidth,candleY);
				candleY=middleY+(value.axis[3]-middleY)*process;
				cacheContext.lineTo(x+kWidth,candleY);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.moveTo(middleX,middleY+(value.axis[1]-middleY)*process);
				cacheContext.lineTo(middleX,candleY);
				cacheContext.lineTo(x,candleY);
				cacheContext.lineTo(x,middleY+(value.axis[0]-middleY)*process);
				cacheContext.stroke();
			};

			/*
			 * 绿色K线，从上往下画
			 * 传入蜡烛左侧x坐标和K线数据[日期，开盘价，最高价，最低价，收盘价，成交量]为参数
			 */
			drawDownCandle=function(x,value){
				middleX=painterTool.getOdd(x+kWidth/2);
				middleY=value.axis[4];
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[value.color];
				cacheContext.strokeStyle=kColor[value.color];
				cacheContext.lineWidth=2;
				candleY=middleY+(value.axis[0]-middleY)*process;
				cacheContext.moveTo(x,candleY);
				cacheContext.lineTo(x+kWidth,candleY);
				candleY=middleY+(value.axis[3]-middleY)*process;
				cacheContext.lineTo(x+kWidth,candleY);
				cacheContext.lineTo(x,candleY);
				cacheContext.closePath();
				cacheContext.fill();
				cacheContext.stroke();
				cacheContext.beginPath();
				cacheContext.moveTo(middleX,middleY+(value.axis[1]-middleY)*process);
				cacheContext.lineTo(middleX,middleY+(value.axis[2]-middleY)*process);
				cacheContext.stroke();
			};

			/*
			 * 绘制ma均线
			 * 传入索引，表示绘制哪一个均线
			 */
			drawMA=function(index){
				var value,x,l;
				value=data.maData[index];
				x=leftX+gapWidth+kWidth/2;
				l=start+Math.floor((end-start)*process);
				cacheContext.beginPath();
				cacheContext.strokeStyle=maColor[index];
				cacheContext.lineWidth=1;
				//为ma补足头部图形
				if(start>0){
					cacheContext.moveTo(leftX,(value[start].maAxis+topY+height*(max-value[start-1][0])/range)/2);
				}
				for(var i=start;i<l;i++){
					cacheContext.lineTo(x,value[i].maAxis);
					x+=gapWidth+kWidth;
				}
				//为ma补足尾部图形
				if(i==end){
					if(value[i]!="-"){
						cacheContext.lineTo(rightX,(value[i-1].maAxis+value[i].maAxis)/2);
					}
				}
				cacheContext.stroke();
			};
			
			//根据process进度情况，绘制K线蜡烛图图形帧
			drawFrame=function(){
				drawGrid();
				candleX=leftX+gapWidth;
				for(var i=start;i<end;i++){
					if(data[i].color==1){
						drawUpCandle(candleX,data[i]);
					}else{
						drawDownCandle(candleX,data[i]);
					}
					candleX+=gapWidth+kWidth;
				}
				for(i in data.maData){
					drawMA(i);
				}
			};

			/*
			 * 初始化基本配置
			 * 数据不在init方法中被传入，否则触控事件就要多次不必要的调用init方法
			 */
			initSize=function(){
				initValue();
			};
			
			/*
			 * 根据传入的数据初始化配置变量，每次执行drawReady就认为数据有变化
			 * 接收二维数组为参数，每一项包含[日期，开盘价，最高价，最低价，收盘价，成交量];
			 * candleData本身为数组，包含maData指针指向均线数组，axis属性指向坐标数组
			 */
			drawReady=function(candleData,startPosition,endPosition){
				if(!candleData || candleData.length==0){
					return ;
				}
				data=candleData;
				start=startPosition;
				end=endPosition;
				handleData();
			};

			//onresize重绘
			resizeDraw=function(){
				initValue();
				calcAxis();
				drawFrame();
			};

			//判断x,y是否在绘制区域内
			insideOf=function(x,y){
				if(x>=leftX && x<=rightX && y>=topY && y<=bottomY){
					return true;
				}else{
					return false;
				}
			};
			
			return {
				initSize:initSize,
				drawReady:drawReady,
				drawFrame:drawFrame,
				resizeDraw:resizeDraw,
				insideOf:insideOf
			};
		})();
		
		/*
		 * 交易量柱状图绘图器，子绘图器操作在缓冲画布中，不影响显示
		 */
		barPainter=(function(){
			//数据
			var data,initValue,max,width,height,leftX,rightX,topY,
				bottomY,barX,layout,start,end;
			//方法
			var initSize,drawReady,resizeDraw,drawFrame,handleData,drawGrid,
				drawBar,calcAxis,insideOf,drawMA;
			//固定配置
			layout={a:0.74,b:0.01,c:0.01,d:0.01};

			initValue=function(){
				width=realCanvas.width*(1-layout.b-layout.d);
				height=realCanvas.height*(1-layout.a-layout.c);
				leftX=realCanvas.width*layout.d;
				rightX=leftX+width;
				topY=realCanvas.height*layout.a;
				bottomY=topY+height;
			};

			//计算交易量柱的高度
			calcAxis=function(){
				var i,k;
				for(i=start;i<end;i++){
					data[i].baHeight=data[i][5]/max*height;
					for(k in data.maData){
						data.maData[k][i].maBaAxis=bottomY-height*data.maData[k][i][1]/max;
					}
				}

			};

			//计算成交量的最大值
			handleData=function(){
				var i,j,b,e;
				max=data[start][5];
				if(start>0){
					b=start-1;
				}else{
					b=start;
				}
				if(end<data.length){
					e=end+1;
				}else{
					e=end;
				}
				for(i=b;i<e;i++){
					if(max<data[i][5]){
						max=data[i][5];
					}
					for(j in data.maData){
						if(max<data.maData[j][i][1]){
							max=data.maData[j][i][1];
						}
					}
				}
				calcAxis();
			};

			//绘制边框虚线
			drawGrid=function(){
				var y;
				cacheContext.beginPath();
				cacheContext.strokeStyle="#000";
				cacheContext.lineWidth=1;
				//绘制实线
				cacheContext.moveTo(painterTool.getOdd(leftX),painterTool.getOdd(topY));
				cacheContext.lineTo(painterTool.getOdd(rightX),painterTool.getOdd(topY));
				cacheContext.lineTo(painterTool.getOdd(rightX),painterTool.getOdd(bottomY));
				cacheContext.lineTo(painterTool.getOdd(leftX),painterTool.getOdd(bottomY));
				cacheContext.closePath();
				cacheContext.stroke();
				//绘制虚线
				y=painterTool.getOdd(topY+height/2);
				painterTool.drawDashed({x:leftX,y:y},{x:rightX,y:y});
				//绘制y轴文字
				cacheContext.fillStyle="#999";
				cacheContext.font=fontSize+"px Arial";
				cacheContext.textAlign="left";
				cacheContext.textBaseline="top";
				cacheContext.fillText("成交量:"+max,leftX,topY);
			};

			//绘制成交量柱
			drawBar=function(x,data){
				var y;
				cacheContext.beginPath();
				cacheContext.fillStyle=kColor[data.color];
				cacheContext.moveTo(x,bottomY);
				cacheContext.lineTo(x+kWidth,bottomY);
				y=bottomY-data.baHeight*process;
				cacheContext.lineTo(x+kWidth,y);
				cacheContext.lineTo(x,y);
				cacheContext.closePath();
				cacheContext.fill();
			};

			//绘制成交量ma均线
			drawMA=function(index){
				var value,x,l;
				value=data.maData[index];
				x=leftX+gapWidth+kWidth/2;
				l=start+Math.floor((end-start)*process);
				cacheContext.beginPath();
				cacheContext.strokeStyle=maColor[index];
				cacheContext.lineWidth=1;
				//为ma补足头部图形
				if(start>0){
					cacheContext.moveTo(leftX,(value[start].maBaAxis+bottomY-height*value[start-1][1]/max)/2);
				}
				for(var i=start;i<l;i++){
					cacheContext.lineTo(x,value[i].maBaAxis);
					x+=gapWidth+kWidth;
				}
				//为ma补足尾部图形
				if(i==end){
					if(value[i]!="-"){
						cacheContext.lineTo(rightX,(value[i-1].maBaAxis+value[i].maBaAxis)/2);
					}
				}
				cacheContext.stroke();
			};

			//根据process进度情况，绘制交易量图形帧
			drawFrame=function(){
				drawGrid();
				barX=leftX+gapWidth;
				for(var i=start;i<end;i++){
					drawBar(barX,data[i]);
					barX+=gapWidth+kWidth;
				}
				for(i in data.maData){
					drawMA(i);
				}
			};

			/*
			 * 初始化基本配置
			 * 数据不在initSize方法中被传入，否则触控事件就要多次不必要的调用init方法
			 */
			initSize=function(){
				initValue();
			};

			/*
			 * 根据传入的数据初始化配置变量，每次执行drawReady就认为数据有变化
			 * 接收二维数组为参数，每一项包含[日期，开盘价，最高价，最低价，收盘价，成交量];
			 */
			drawReady=function(barData,startPosition,endPosition){
				if(!barData || barData.length==0){
					return ;
				}
				data=barData;
				start=startPosition;
				end=endPosition;
				handleData();
			};

			//onresize重绘
			resizeDraw=function(){
				initValue();
				calcAxis();
				drawFrame();
			};

			//判断x,y是否在绘制区域内
			insideOf=function(x,y){
				if(x>=leftX && x<=rightX && y>=topY && y<=bottomY){
					return true;
				}else{
					return false;
				}
			};

			return {
				initSize:initSize,
				drawReady:drawReady,
				drawFrame:drawFrame,
				resizeDraw:resizeDraw,
				insideOf:insideOf
			};
		})();

		/*
		 * 【K线蜡烛图、交易量柱图】事件控制器，左右滑动、缩放事件
		 */
		kControl=(function(){
			//数据
			var data;
			//控制参数
			var totalLength,minScale,maxScale,scaleStep,scrollStep,currScale,
				currPosition,
				dayCount;
			//方法
			var init,draw,enlarge,narrow,scrollRight,scrollLeft,
				calcMA,calcColor;
			//固定变量
			scaleStep=1;
			scrollStep=1;
			dayCount=[5,10,20];


			/*
			 * 计算均线值，传入股票数据和均线日期
			 * maData={
			 * 	5:[[K线ma5，交易量ma5]，[]...]
			 * }
			 */
			calcMA=function(){
				var i,j,k, l,sumk,sumb,maData;
				maData={};
				for(i=0,l=dayCount.length;i<l;i++){
					maData[dayCount[i]]=[];
					for(j=0;j<totalLength;j++){
						if(j<dayCount[i]){
							maData[dayCount[i]].push(["-","-"]);
							continue;
						}
						sumk=0;
						sumb=0;
						for(k=0;k<dayCount[i];k++){
							sumk+=data[j-k][4];
							sumb+=data[j-k][5];
						}
						maData[dayCount[i]].push([sumk/dayCount[i],sumb/dayCount[i]]);
					}
					maData[dayCount[i]].push("-");
				}
				data.maData=maData;
			};

			//计算颜色指标
			calcColor=function(){
				for(var i=0;i<totalLength;i++){
					//颜色指标
					if(data[i][4]>=data[i][1]){
						data[i].color=1;
					}else{
						data[i].color=0;
					}
				}
			};

			//控制器启动绘图
			draw=function(){
				var start;
				start=currPosition-currScale;
				for(var i in painterStack){
					painterStack[i].drawReady(data,start,currPosition);
				}
				animate();
			};

			//初始化比例尺
			init=function(rawData){
				data=rawData;
				totalLength=rawData.length;
				minScale=totalLength>40 ? 40:totalLength;
				maxScale=totalLength>100 ? 100:totalLength;
				currScale=totalLength>60 ? 60:totalLength;
				currPosition=totalLength;
				calcMA();
				calcColor();
				draw();
			};

			//放大-减少显示条数
			enlarge=function(){
				if(currScale>minScale){
					currScale-=scaleStep;
					if(currScale<minScale){
						currScale=minScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//缩小-增加显示条数
			narrow=function(){
				if(currScale<maxScale){
					currScale+=scaleStep;
					if(currScale>maxScale){
						currScale=maxScale;
					}
					if(currScale>currPosition){
						currPosition=currScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//手指向右滑动-数据向左滚动
			scrollRight=function(){
				if(currPosition>currScale){
					currPosition-=scrollStep;
					if(currPosition<currScale){
						currPosition=currScale;
					}
					draw();
				}else{
					return ;
				}
			};

			//手指向左滑动-数据向右滚动
			scrollLeft=function(){
				if(currPosition<totalLength){
					currPosition+=scrollStep;
					if(currPosition>totalLength){
						currPosition=totalLength;
					}
					draw();
				}else{
					return ;
				}
			};

			return {
				init:init,
				enlarge:enlarge,
				narrow:narrow,
				scrollLeft:scrollLeft,
				scrollRight:scrollRight
			};
		})();

		/*------------------------绘图器end---------------------------*/
		//动画结束后绑定触控事件
		bindListener=function(){
			//变量
			var hammerManager,hammerPan,hammerPinch,hammerPress,offsetLeft,offsetTop,
				x,y;
			//方法-避免事件未被清理
			var press,pressup,panup,pandown,panright,panleft,
				panend,pinchin,pinchout,setup;

			hammerManager=new Hammer.Manager(container);
			hammerPan=new Hammer.Pan();
			hammerPinch = new Hammer.Pinch();
			hammerPress=new Hammer.Press();
			hammerManager.add([hammerPan,hammerPinch,hammerPress]);
			offsetLeft=container.offsetLeft;
			offsetTop=container.offsetTop;

			//长按
			press=function(){
			};

			//抬起手指
			pressup=function(){
			};

			//向上滑
			panup=function(){
			};

			//向下滑
			pandown=function(){
			};

			//手指右滑
			panright=function(){
				currControl.scrollRight();
			};

			//手指左滑
			panleft=function(){
				currControl.scrollLeft();
			};

			//结束滑动
			panend=function(){
			};

			//缩小
			pinchin=function(){
				currControl.narrow();
			};

			//放大
			pinchout=function(){
				currControl.enlarge();
			};

			//柯里化封装方法
			setup=function(callback){
				return function(e){
					x=(e.changedPointers[0].pageX-offsetLeft)*2;
					y=(e.changedPointers[0].pageY-offsetTop)*2;
					for(var i in painterStack){
						if(painterStack[i].insideOf(x,y)){
							callback();
						}
					}
				};
			};

			//绑定所有事件
			hammerManager.on("press",setup(press));
			hammerManager.on("pressup",setup(pressup));
			hammerManager.on("panup",setup(panup));
			hammerManager.on("pandown",setup(pandown));
			hammerManager.on("panright",setup(panright));
			hammerManager.on("panleft",setup(panleft));
			hammerManager.on("panend",setup(panend));
			hammerManager.on("pinchin",pinchin);
			hammerManager.on("pinchout",pinchout);

			//鼠标滚动缩放事件
			container.addEventListener("mousewheel", function(event) {
				if(event.wheelDelta>0){
					currControl.narrow();
				}else if(event.wheelDelta<0){
					currControl.enlarge();
				}
			});
		};

		/*
		 * 动画，执行所有进入方法栈的drawFrame方法
		 * 如果process为1，则animate退化成无动画绘制
		 * 每个页面只执行一次动画，要修改的话，在最后一次animate将process初始化
		 */
		animate=function(){
			cacheContext.clearRect(0,0,cacheCanvas.width,cacheCanvas.height);
			speed=Math.ceil((100-process*100)/30)/100;
			process+=speed;
			if(process<1){
				for(var i in painterStack){
					painterStack[i].drawFrame();
				}
				requestAnimationFrame(animate);
			}else{
				process=1;
				for(var i in painterStack){
					painterStack[i].drawFrame();
				}
			}
			refreshCache();
		};

		//将虚拟画布上的图形刷新到画布上
		refreshCache=function(){
			container.removeChild(realCanvas);
			realContext.clearRect(0,0,realCanvas.width,realCanvas.height);
			realContext.drawImage(cacheCanvas,0,0);
			container.appendChild(realCanvas);
		};

		//全局初始化，调用各个内部初始化方法，页面就绪即可执行
		init=function(){
			initDom();
			initCanvas();
			candlePainter.initSize();
			barPainter.initSize();
		};
		
		//开始绘制,接收接口返回的数据
		draw=function(ajaxData,period){
			rawData=ajaxData;
			if(period>9){
				//分时图

			}else{
				//K线图
				painterStack=[];
				painterStack.push(candlePainter);
				painterStack.push(barPainter);
				currControl=kControl;
				currControl.init(rawData);
			}
			bindListener();
		};

		//窗口大小变化时重绘
		resize=function(){
			initCanvas();
			cacheContext.clearRect(0,0,cacheCanvas.width,cacheCanvas.height);
			for(var i in painterStack){
				painterStack[i].resizeDraw();
			}
			refreshCache();
		};

		return {
			init:init,
			draw:draw,
			resize:resize
		};
	})();

	/*
	 * 请求分派器，管理所有的ajax请求，并执行相应操作
	 */
	requestDispatcher=(function(){
		/*
		 * candlePeriod>>openapi参数
		 * 1：1分钟K线 2：5分钟K线 3：15分钟K线 4：30分钟K线 5：60分钟K线 6：日K线 7：周K线 8：月K线 9：年K线
		 */
		var authorization,stockCode,candlePeriod,supportType;
		var queryToken,queryKLine,queryTrend,handleToken,handleKLine,handleTrend,
			getKLine;
		supportType={
			"1分钟":1,
			"5分钟":2,
			"15分钟":3,
			"30分钟":4,
			"60分钟":5,
			"日K":6,
			"周K":7,
			"月K":8,
			"年K":9,
			"分时":10,
			"五日":11
		};

		//校验code,period是否正确，执行绘图方法
		handleKLine=function(code,period,data){
			if(code!=stockCode){
				return ;
			}
			if(period!=candlePeriod){
				return ;
			}
			KPainter.draw(data,period);
		};

		//openapi获取token成功
		handleToken=function(result){
			authorization=result.token_type+" "+result.access_token;
			if(candlePeriod!=undefined && stockCode!=undefined){
				if(candlePeriod>9){
					//分时图
				}else{
					//K线图
					queryKLine(stockCode,candlePeriod);
				}
			}
		};

		//获取openapi的K线数据
		queryKLine=function(code,period){
			Util.ajax({
				type:"get",
				url:"https://open.hscloud.cn/quote/v1/kline",
				contentType:"application/x-www-form-urlencoded; charset=utf-8",
				data:{
					get_type:"offset",
					prod_code:code,
					candle_period:period,
					fields:"open_px,high_px,low_px,close_px,business_amount",
					data_count:200
				},
				beforeSend: function(request) {
					request.setRequestHeader("Authorization",authorization);
				},
				success:function(result){
					if(result){
						handleKLine(code,period,result.data.candle[code]);
					}
				},
				error:function(error){
					console.error("queryKLine:",error);
				}
			});
		};

		//获取openapi的token
		queryToken=function(){
			var APPKEY="36925ca9-6768-47f7-8124-fa2a9a8a2c7d";
			var APPSECRET="d392dff7-14f5-4437-a0b2-5386fa72162f";
			var BASIC="Basic ";
			var auth=Base64.encode(APPKEY+":"+APPSECRET);
			var openId="bigbird-kline:"+Math.random();

			Util.ajax({
				type:"post",
				url:"https://open.hscloud.cn"+"/oauth2/oauth2/token",
				contentType:"application/x-www-form-urlencoded",
				data:{
					grant_type:"client_credentials",
					open_id:openId
				},
				beforeSend:function(request) {
					request.setRequestHeader("Authorization", BASIC+auth);
				},
				success:function(result){
					if(result){
						handleToken(result);
					}
				},
				error:function(error){
					console.error("queryToken:",error);
				}
			});
		};

		//暴露给外部使用的查询方法
		getKLine=function(code,type){
			stockCode=code;
			candlePeriod=supportType[type];
			if(authorization==undefined){
				queryToken();
			}else{
				if(candlePeriod>9){
					//分时图
				}else{
					//K线图
					queryKLine(stockCode,candlePeriod);
				}
			}
		};

		return {
			getKLine:getKLine
		};
	})();

	/*
	 * 页面控制器，管理页面启动，页面重置等页面级逻辑
	 */
	pageControl=(function(){
		var beginPage;

		//页面启动逻辑
		beginPage=function(){
			requestDispatcher.getKLine("600570.SS","日K");
			KPainter.init();
		};

		return {
			beginPage:beginPage
		};
	})();

	Util.ready(pageControl.beginPage);
})();
